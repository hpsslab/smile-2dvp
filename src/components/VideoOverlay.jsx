import { useRef, useState, useEffect } from "react";
import Modal from "./Modal";
import { getColorForClass } from "../utils/classColors";
import { displayNames } from "../utils/displayNames";

export default function VideoOverlay({ videoSrc, roi }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [currentBoxes, setCurrentBoxes] = useState([]);
  const [selectedBox, setSelectedBox] = useState(null);

  // Sort frames once for deterministic order
  const frames = roi.frames.sort((a, b) => a.t - b.t);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const t = video.currentTime;
      let frame = frames[0];
      for (let i = 0; i < frames.length; i++) {
        if (frames[i].t > t) break;
        frame = frames[i];
      }
      setCurrentBoxes(frame.boxes || []);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [frames]);

  // ✅ Fullscreen on container, not just video
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
          const color = getColorForClass(box.label_id); // ✅ distinct color per class

          return (
            <div
              key={i}
              className="absolute rounded pointer-events-auto cursor-pointer"
              style={{
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                width: `${w * 100}%`,
                height: `${h * 100}%`,
                border: `2px solid ${color}`,
                backgroundColor: `${color}33`, // ~20% opacity fill
              }}
              onClick={() => setSelectedBox(box)}
            >
              <span
                className="absolute top-0 left-0 text-xs text-white px-1 rounded-br"
                style={{ backgroundColor: color }}
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
