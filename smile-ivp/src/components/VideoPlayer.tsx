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
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<ReactPlayer>(null);

  useEffect(() => {
    // Find ROIs for current time
    const currentFrame = roiData.frames.find(
      frame => currentTime >= frame['start-time']*1.03 && currentTime <= frame['end-time']*1.03
      // frame => currentTime >= frame['start-time']*1 && currentTime <= frame['end-time']*1
    );
    setCurrentROIs(currentFrame?.objects || []);
  }, [currentTime, roiData]);

  const handleProgress = ({ playedSeconds }: { playedSeconds: number }) => {
    setCurrentTime(playedSeconds);
  };

  const handleROIClick = (object: ROIObject) => {
    setPlaying(false);
    onROIClick(object);
  };

  const handlePlay = () => {
    setPlaying(true);
  };

  const handlePause = () => {
    setPlaying(false);
  };

  return (
    <Box sx={{ 
      position: 'relative', 
      width: '100%', 
      maxWidth: '1280px', 
      margin: '0 auto',
      display: 'flex',
      justifyContent: 'center'
    }}>
      <Box sx={{ 
        position: 'relative',
        width: '1280px',
        height: '720px',
        maxWidth: '100%'
      }}>
        <ReactPlayer
          ref={playerRef}
          url={url}
          width="100%"
          height="100%"
          playing={playing}
          onProgress={handleProgress}
          onPlay={handlePlay}
          onPause={handlePause}
          controls
          progressInterval={10}
          style={{ maxWidth: '100%' }}
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
                  backgroundColor: 'rgba(255, 0, 0, 0)',
                  color: 'white',
                  zIndex: 1,
                }}
              >
                {/* <Typography variant="caption">{roi.annotation}</Typography> */}
              </Paper>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default VideoPlayer; 