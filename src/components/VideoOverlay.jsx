import { useRef, useState, useEffect, useMemo } from "react";
import Modal from "./Modal";
import { getColorForClass } from "../utils/classColors";
import { displayNames } from "../utils/displayNames";

const BOX_HOLD_DURATION = 0.2; // seconds to keep stale boxes visible
const CONTROL_ZONE_RATIO = 0.12; // bottom portion reserved for native player controls

export default function VideoOverlay({ videoSrc, roi }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [currentBoxes, setCurrentBoxes] = useState([]);
  const [selectedBox, setSelectedBox] = useState(null);
  const [hoveredBoxId, setHoveredBoxId] = useState(null);
  const [descriptionMapping, setDescriptionMapping] = useState(null);
  const [mappingError, setMappingError] = useState(null);
  const [descriptionStatus, setDescriptionStatus] = useState("idle");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const latestFetchRef = useRef(0);

  // Sort frames once for deterministic order
  const frames = roi.frames.sort((a, b) => a.t - b.t);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let animationFrameId;
    let previousTime = video.currentTime ?? 0;
    const update = () => {
      const t = video.currentTime;
      let frame = frames[0];
      for (let i = 0; i < frames.length; i++) {
        if (frames[i].t > t) break;
        frame = frames[i];
      }

      const now = video.currentTime;
      const isSeeking = video.seeking || Math.abs(now - previousTime) > 0.1;
      previousTime = now;

      setCurrentBoxes(prevBoxes => {
        if (isSeeking) {
          return (frame.boxes || []).map(box => ({
            ...box,
            lastSeen: now,
          }));
        }

        const prevMap = new Map(
          prevBoxes.map(b => [b.track_id ?? b.label_id, b])
        );

        const nextBoxes = [];

        for (const box of frame.boxes || []) {
          const key = box.track_id ?? box.label_id;
          const prev = prevMap.get(key);
          const lastSeen = now;

          nextBoxes.push({
            ...box,
            lastSeen,
            // preserve any additional fields we may have added earlier
            ...(prev ? { ...prev, ...box, lastSeen } : {}),
          });

          prevMap.delete(key);
        }

        prevMap.forEach(prev => {
          const lastSeen = prev.lastSeen ?? now;
          if (lastSeen <= now && now - lastSeen <= BOX_HOLD_DURATION) {
            nextBoxes.push({ ...prev, lastSeen });
          }
        });

        return nextBoxes;
      });

      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrameId);
  }, [frames]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let cancelled = false;
    const baseUrl = new URL(import.meta.env.BASE_URL || "/", window.location.origin);
    const mappingUrl = new URL("./descriptions/mapping.json", baseUrl).toString();

    fetch(mappingUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load description mapping (${response.status})`);
        }
        return response.json();
      })
      .then(data => {
        if (!cancelled) {
          setDescriptionMapping(data);
        }
      })
      .catch(error => {
        if (cancelled) return;
        console.error("Failed to load description mapping", error);
        setMappingError(error);
        setDescriptionMapping({});
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const mappingLookup = useMemo(() => {
    if (!descriptionMapping) return null;
    const lookup = {};
    Object.entries(descriptionMapping).forEach(([key, value]) => {
      if (!key || !value) return;
      const trimmed = key.trim();
      if (!trimmed) return;
      const variants = new Set([
        trimmed,
        trimmed.toLowerCase(),
        trimmed.replace(/\s+/g, '_'),
        trimmed.replace(/\s+/g, '-'),
        trimmed.replace(/[^a-z0-9]+/gi, '_').toLowerCase(),
      ]);
      variants.forEach(variant => {
        if (variant) {
          lookup[variant] = value;
        }
      });
    });
    return lookup;
  }, [descriptionMapping]);

  const getBoxLabel = box => {
    if (!box) return "";
    return (
      displayNames[box.label_id] ||
      box.label_name ||
      (typeof box.label_id === "number" ? `Label ${box.label_id}` : "Object")
    );
  };

  const normalizeHtmlContent = (html, htmlPath) => {
    if (typeof window === "undefined") {
      return html;
    }

    try {
      const baseUrl = new URL(htmlPath, window.location.origin);
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const processAttribute = (element, attribute) => {
        const value = element.getAttribute(attribute);
        if (!value) return;

        if (attribute === "srcset") {
          const rewritten = value
            .split(",")
            .map(part => part.trim())
            .filter(Boolean)
            .map(part => {
              const [urlPart, descriptor] = part.split(/\s+/, 2);
              if (!urlPart) return null;
              try {
                const resolved = new URL(urlPart, baseUrl).toString();
                return descriptor ? `${resolved} ${descriptor}` : resolved;
              } catch (error) {
                console.warn("Failed to resolve srcset part", urlPart, error);
                return null;
              }
            })
            .filter(Boolean);

          if (rewritten.length > 0) {
            element.setAttribute(attribute, rewritten.join(", "));
          }
          return;
        }

        try {
          element.setAttribute(attribute, new URL(value, baseUrl).toString());
        } catch (error) {
          console.warn("Failed to resolve asset attribute", attribute, value, error);
        }
      };

      doc.querySelectorAll("[src], [srcset], [href]").forEach(node => {
        if (node.hasAttribute("src")) {
          processAttribute(node, "src");
        }
        if (node.hasAttribute("srcset")) {
          processAttribute(node, "srcset");
        }
        if (node.hasAttribute("href")) {
          processAttribute(node, "href");
        }
      });

      const article = doc.querySelector("article");
      if (article) {
        return article.outerHTML;
      }

      return doc.body.innerHTML || html;
    } catch (error) {
      console.error("Failed to normalize description HTML", error);
      return html;
    }
  };


  useEffect(() => {
    if (!selectedBox) {
      setDescriptionHtml("");
      setDescriptionStatus("idle");
      return;
    }

    if (!mappingLookup || Object.keys(mappingLookup).length === 0) {
      setDescriptionHtml("");
      setDescriptionStatus(mappingError ? "error" : "loading");
      return;
    }

    const candidates = new Set();
    if (selectedBox.label_name) {
      candidates.add(selectedBox.label_name);
    }
    if (
      Number.isFinite(selectedBox.label_id) &&
      displayNames[selectedBox.label_id]
    ) {
      candidates.add(displayNames[selectedBox.label_id]);
    }

    const keysToTry = Array.from(candidates).flatMap(name => {
      if (!name) return [];
      const trimmed = name.trim();
      if (!trimmed) return [];
      return [
        trimmed,
        trimmed.toLowerCase(),
        trimmed.replace(/\s+/g, '_'),
        trimmed.replace(/\s+/g, '-'),
        trimmed.replace(/[^a-z0-9]+/gi, '_').toLowerCase(),
      ];
    });

    const htmlPath = keysToTry.map(key => mappingLookup[key]).find(Boolean) || null;

    if (!htmlPath) {
      setDescriptionHtml("");
      setDescriptionStatus("missing");
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const baseUrl = new URL(import.meta.env.BASE_URL || "/", window.location.origin);
    const resolvedHtmlUrl = new URL(htmlPath, baseUrl).toString();

    const controller = new AbortController();
    const requestId = latestFetchRef.current + 1;
    latestFetchRef.current = requestId;
    setDescriptionStatus("loading");

    fetch(resolvedHtmlUrl, { signal: controller.signal })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load description (${response.status})`);
        }
        return response.text();
      })
      .then(html => {
        if (latestFetchRef.current !== requestId) {
          return;
        }
        const normalized = normalizeHtmlContent(html, resolvedHtmlUrl);
        setDescriptionHtml(normalized);
        setDescriptionStatus("ready");
      })
      .catch(error => {
        if (controller.signal.aborted) {
          return;
        }
        console.error("Failed to load description content", error);
        if (latestFetchRef.current !== requestId) {
          return;
        }
        setDescriptionHtml("");
        setDescriptionStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, [selectedBox, mappingLookup, mappingError]);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-4xl mx-auto">
      {/* Video */}
      <video
        ref={videoRef}
        src={videoSrc}
        controls
        controlsList="nofullscreen"
        className="w-full rounded-lg shadow"
      />

      {/* Overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {currentBoxes.map((box, i) => {
          const [x, y, w, h] = box.bbox;
          const color = getColorForClass(box.label_id);
          const confidence = box.conf ?? box.score;
          const timeSinceSeen = Math.max(
            0,
            (videoRef.current?.currentTime ?? 0) - (box.lastSeen ?? 0)
          );
          const staleProgress = Math.min(1, timeSinceSeen / BOX_HOLD_DURATION);

          // Focus heuristics
          const centerX = x + w / 2;
          const centerY = y + h / 2;
          const isCentered =
            centerX > 0.25 && centerX < 0.75 && centerY > 0.25 && centerY < 0.75;
          const isSmallBox = w * h < 0.05;
          const hasConfidence = confidence === undefined || confidence > 0.5;

          // Block bottom-left/right controls only
          const bottomEdge = y + h;
          const rightEdge = x + w;
          const isBottom = bottomEdge > 0.85;
          const isLeftSide = x < 0.15;
          const isRightSide = rightEdge > 0.85;
          const isBlockingControls = isBottom && (isLeftSide || isRightSide);

          const isFocused =
            (isCentered || isSmallBox) && hasConfidence && !isBlockingControls;

          const controlTopBoundary = 1 - CONTROL_ZONE_RATIO;
          const overlapDepth = Math.max(0, bottomEdge - controlTopBoundary);
          const overlapRatio = h > 0 ? Math.min(1, overlapDepth / h) : 0;
          const interactiveBottomPercent = overlapRatio * 100;
          const hasInteractiveRegion = isFocused && overlapRatio < 1;

          const boxKey = box.track_id ?? `${box.label_id}-${i}`;

          return (
            <div
              key={boxKey}
              className={`absolute rounded ${
                isFocused
                  ? "transition-transform duration-150 ease-out"
                  : "opacity-60"
              } pointer-events-none`}
              style={{
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                width: `${w * 100}%`,
                height: `${h * 100}%`,
                border: `2px solid ${color}`,
                opacity: isFocused ? 1 - staleProgress * 0.5 : 0.6 - staleProgress * 0.3,
                backgroundColor: `${color}${isFocused ? "33" : "15"}`,
                transform:
                  isFocused && hoveredBoxId === boxKey ? "scale(1.05)" : "scale(1)",
                transformOrigin: "center",
              }}
            >
              {hasInteractiveRegion && (
                <div
                  className="absolute inset-x-0 top-0 pointer-events-auto hover:scale-105 focus-visible:scale-105 focus-visible:outline-none cursor-pointer"
                  style={{
                    bottom: `${interactiveBottomPercent}%`,
                    borderRadius: "inherit",
                  }}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => setHoveredBoxId(boxKey)}
                  onMouseLeave={() => setHoveredBoxId(null)}
                  onFocus={() => setHoveredBoxId(boxKey)}
                  onBlur={() => setHoveredBoxId(null)}
                  onClick={() => {
                    videoRef.current?.pause();
                    setSelectedBox(box);
                  }}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      videoRef.current?.pause();
                      setSelectedBox(box);
                    }
                  }}
                />
              )}
              <span
                className="absolute top-0 left-0 text-xs text-white px-1 rounded-br"
                style={{
                  backgroundColor: color,
                  opacity: isFocused ? 1 : 0.6,
                  pointerEvents: "none",
                }}
              >
                {displayNames[box.label_id] || box.label_name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Fullscreen Button */}
      <button
        className="absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1 rounded hover:bg-black/80"
        onClick={handleFullscreen}
      >
        ⛶
      </button>

      {/* Modal */}
      <Modal
        isOpen={!!selectedBox}
        onClose={() => setSelectedBox(null)}
        title={selectedBox ? getBoxLabel(selectedBox) : ""}
      >
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-6 shadow-inner">
            {descriptionStatus === "loading" && (
              <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
                Loading description...
              </div>
            )}
            {descriptionStatus === "ready" && (
              <div className="smile-description-surface">
                <div
                  className="prose prose-slate max-w-none smile-description-html"
                  dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                />
              </div>
            )}
            {descriptionStatus === "missing" && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-4 text-sm text-slate-500">
                No description available for this object yet.
              </div>
            )}
            {descriptionStatus === "error" && (
              <div className="rounded-xl border border-red-200 bg-red-50/90 p-4 text-sm text-red-700">
                Unable to load the description right now. Please try again.
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
