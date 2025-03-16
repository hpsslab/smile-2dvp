import React, { useState, useRef, useEffect } from 'react';
import ReactPlayer from 'react-player';
import { Box, Paper, Typography } from '@mui/material';
import { ROIData, ROIObject } from '../types/roi';

interface VideoPlayerProps {
  url: string;
  roiData: ROIData;
  onROIClick: (object: ROIObject) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ url, roiData, onROIClick }) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [currentROIs, setCurrentROIs] = useState<ROIObject[]>([]);
  const playerRef = useRef<ReactPlayer>(null);

  useEffect(() => {
    // Find ROIs for current time
    const currentFrame = roiData.frames.find(
      frame => currentTime >= frame['start-time'] && currentTime <= frame['end-time']
    );
    setCurrentROIs(currentFrame?.objects || []);
  }, [currentTime, roiData]);

  const handleProgress = ({ playedSeconds }: { playedSeconds: number }) => {
    setCurrentTime(playedSeconds);
  };

  const handleROIClick = (object: ROIObject) => {
    onROIClick(object);
  };

  return (
    <Box sx={{ position: 'relative', width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
      <ReactPlayer
        ref={playerRef}
        url={url}
        width="100%"
        height="auto"
        onProgress={handleProgress}
        controls
      />
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none'
        }}
      >
        {currentROIs.map((roi) => (
          <Box
            key={roi['object-id']}
            sx={{
              position: 'absolute',
              left: roi.geometry.x,
              top: roi.geometry.y,
              width: roi.geometry.width,
              height: roi.geometry.height,
              border: '2px solid red',
              pointerEvents: 'auto',
              cursor: 'pointer'
            }}
            onClick={() => handleROIClick(roi)}
          >
            <Paper
              sx={{
                position: 'absolute',
                top: -25,
                left: 0,
                padding: '2px 8px',
                backgroundColor: 'rgba(255, 0, 0, 0.8)',
                color: 'white',
                zIndex: 1,
              }}
            >
              <Typography variant="caption">{roi.annotation}</Typography>
            </Paper>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default VideoPlayer; 