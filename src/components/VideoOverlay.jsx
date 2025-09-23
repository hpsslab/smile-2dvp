import { useRef, useState, useEffect } from "react";
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
        title={selectedBox?.label_name || ""}
      >
        <h1 className="text-lg font-semibold">{selectedBox?.label_name}</h1>
        <p className="mt-2">This will show description.html in the future.</p>
      </Modal>
    </div>
  );
}
