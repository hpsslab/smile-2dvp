import { useEffect, useState } from "react";
import VideoOverlay from "./components/VideoOverlay";

const DEFAULT_MEDIA = {
  video: "videos/demo-websafe-compressed.mp4",
  roi: "ROI/demo.roi",
  audio: "music/tech-nature-no-copyright-music-413566.mp3",
};

const ensureTrailingSlash = value => {
  if (!value) return "/";
  return value.endsWith("/") ? value : `${value}/`;
};

const toPublicUrl = path => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return path;
  const base = ensureTrailingSlash(import.meta.env.BASE_URL ?? "/");
  return `${base}${path.replace(/^\/+/g, "")}`;
};

const getDefaultMedia = () => ({ ...DEFAULT_MEDIA });

const sanitizeMediaEntry = entry => {
  if (!entry || typeof entry !== "object") return null;

  const clean = value => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const video = clean(entry.video);
  const roi = clean(entry.roi);
  const audio = clean(entry.audio);

  if (!video || !roi) {
    return null;
  }

  return audio ? { video, roi, audio } : { video, roi };
};

const pickMediaFromConfig = config => {
  if (!config || typeof config !== "object") {
    return { selection: getDefaultMedia(), reason: "missing" };
  }

  const direct = sanitizeMediaEntry(config);
  if (direct) {
    return { selection: direct };
  }

  const sets = typeof config.sets === "object" && config.sets !== null ? config.sets : null;
  if (sets) {
    if (config.activeSet && Object.prototype.hasOwnProperty.call(sets, config.activeSet)) {
      const active = sanitizeMediaEntry(sets[config.activeSet]);
      if (active) {
        return { selection: active };
      }
    }

    for (const value of Object.values(sets)) {
      const candidate = sanitizeMediaEntry(value);
      if (candidate) {
        return { selection: candidate };
      }
    }

    return { selection: getDefaultMedia(), reason: "invalid" };
  }

  return { selection: getDefaultMedia(), reason: "invalid" };
};

export default function App() {
  const [mediaSelection, setMediaSelection] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [roi, setRoi] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const configUrl = toPublicUrl("config/media.json");

    fetch(configUrl, { cache: "no-store" })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (cancelled) return;
        const { selection, reason } = pickMediaFromConfig(data);
        setMediaSelection(selection);
        if (reason === "invalid") {
          setConfigError("Media configuration is missing required fields. Using defaults.");
        } else if (reason === "missing") {
          setConfigError("Media configuration not found. Using defaults.");
        } else {
          setConfigError(null);
        }
      })
      .catch(err => {
        if (cancelled) return;
        console.error("Failed to load media configuration:", err);
        setConfigError("Could not load media configuration. Using defaults.");
        setMediaSelection(getDefaultMedia());
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mediaSelection) return;

    const roiPath = mediaSelection.roi;
    if (!roiPath) {
      setError("No ROI path configured.");
      setRoi(null);
      return;
    }

    let cancelled = false;
    const roiUrl = toPublicUrl(roiPath);

    setError(null);
    setRoi(null);

    fetch(roiUrl)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (!cancelled) {
          setRoi(data);
        }
      })
      .catch(err => {
        if (cancelled) return;
        console.error("Failed to load ROI:", err);
        setError("Could not load ROI data.");
      });

    return () => {
      cancelled = true;
    };
  }, [mediaSelection]);

  const videoPath = mediaSelection ? toPublicUrl(mediaSelection.video) : null;
  const audioPath = mediaSelection?.audio ? toPublicUrl(mediaSelection.audio) : null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">SMILE-IVP Demo</h1>
          <span className="text-gray-500 text-sm">Prototype v0.1</span>
        </div>
      </header>

      <main className="flex-1 flex justify-center items-center p-6">
        <div className="flex flex-col items-center gap-4 w-full">
          {configError ? (
            <div className="text-yellow-600 text-sm text-center">{configError}</div>
          ) : null}
          {!mediaSelection ? (
            <div className="text-gray-500 animate-pulse">Loading configuration…</div>
          ) : error ? (
            <div className="text-red-600 font-semibold">{error}</div>
          ) : !roi ? (
            <div className="text-gray-500 animate-pulse">Loading ROI…</div>
          ) : (
            <VideoOverlay videoSrc={videoPath} roi={roi} audioSrc={audioPath} />
          )}
        </div>
      </main>

      <footer className="text-center text-xs text-gray-400 py-4">
        © {new Date().getFullYear()} SMILE-IVP | Internal Demo Build
      </footer>
    </div>
  );
}
