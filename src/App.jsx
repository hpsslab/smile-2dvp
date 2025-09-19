import { useEffect, useState } from "react";
import VideoOverlay from "./components/VideoOverlay";

export default function App() {
  const [roi, setRoi] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
  const roiPath = `${import.meta.env.BASE_URL}ROI/demo.roi`;

  fetch(roiPath)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(setRoi)
    .catch((err) => { 
      console.error("Failed to load ROI:", err);
      setError("Could not load ROI data.");
    });
}, []);

  const videoPath = `${import.meta.env.BASE_URL}videos/demo.mp4`;
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">SMILE-IVP Demo</h1>
          <span className="text-gray-500 text-sm">Prototype v0.1</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex justify-center items-center p-6">
        {error ? (
          <div className="text-red-600 font-semibold">{error}</div>
        ) : !roi ? (
          <div className="text-gray-500 animate-pulse">Loading ROI…</div>
        ) : (
          <VideoOverlay videoSrc={videoPath} roi={roi} />
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-400 py-4">
        © {new Date().getFullYear()} SMILE-IVP | Internal Demo Build
      </footer>
    </div>
  );
}
