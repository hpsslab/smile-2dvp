import React, { useState, useEffect } from 'react';
import { Container, CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import VideoPlayer from './components/VideoPlayer';
import PopupDialog from './components/PopupDialog';
import { ROIData, ROIObject } from './types/roi';

const theme = createTheme({
  palette: {
    mode: 'dark',
  },
});

function App() {
  const [currentVideo, setCurrentVideo] = useState<string>('');
  const [roiData, setRoiData] = useState<ROIData>({ frames: [] });
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupContent, setPopupContent] = useState('');
  const [popupTitle, setPopupTitle] = useState('');

  useEffect(() => {
    // Load the M3U playlist
    fetch('/playlist.m3u')
      .then(response => response.text())
      .then(text => {
        const lines = text.split('\n');
        const videoUrl = lines.find(line => line.startsWith('http'));
        if (videoUrl) {
          setCurrentVideo(videoUrl);
          // Load corresponding ROI file
          const roiUrl = videoUrl.replace('.mp4', '.roi');
          fetch(roiUrl)
            .then(response => response.json())
            .then(data => setRoiData(data))
            .catch(error => console.error('Error loading ROI data:', error));
        }
      })
      .catch(error => console.error('Error loading playlist:', error));
  }, []);

  const handleROIClick = (object: ROIObject) => {
    // In a real application, you would fetch the HTML content from a server
    // For now, we'll just show a placeholder
    setPopupTitle(object.annotation);
    setPopupContent(`
      <div style="padding: 20px;">
        <h2>${object.annotation}</h2>
        <p>Object ID: ${object['object-id']}</p>
        <p>This is a placeholder for the actual HTML content that would be displayed when clicking on this ROI.</p>
      </div>
    `);
    setPopupOpen(true);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {currentVideo && (
          <VideoPlayer
            url={currentVideo}
            roiData={roiData}
            onROIClick={handleROIClick}
          />
        )}
        <PopupDialog
          open={popupOpen}
          onClose={() => setPopupOpen(false)}
          title={popupTitle}
          content={popupContent}
        />
      </Container>
    </ThemeProvider>
  );
}

export default App;
