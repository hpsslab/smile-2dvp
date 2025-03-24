import React, { useState, useEffect } from 'react';
import { Container, CssBaseline, ThemeProvider, createTheme, Alert, Snackbar } from '@mui/material';
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load the M3U playlist
    fetch('/playlist.m3u')
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load playlist: ${response.statusText}`);
        }
        return response.text();
      })
      .then(text => {
        const lines = text.split('\n');
        const videoUrl = lines.find(line => line.startsWith('http'));
        if (videoUrl) {
          const trimmedUrl = videoUrl.trim();
          setCurrentVideo(trimmedUrl);
          
          // Load corresponding ROI file
          const roiUrl = trimmedUrl.replace('.mp4', '.roi');
          console.log('Loading ROI file from:', roiUrl);
          
          fetch(roiUrl)
            .then(response => {
              if (!response.ok) {
                throw new Error(`Failed to load ROI file: ${response.statusText}`);
              }
              return response.json();
            })
            .then(data => {
              console.log('ROI data loaded:', data);
              setRoiData(data);
            })
            .catch(error => {
              console.error('Error loading ROI data:', error);
              setError(`Failed to load ROI data: ${error.message}`);
            });
        } else {
          setError('No video URL found in playlist');
        }
      })
      .catch(error => {
        console.error('Error loading playlist:', error);
        setError(`Failed to load playlist: ${error.message}`);
      });
  }, []);

  const handleROIClick = async (object: ROIObject) => {
    setPopupTitle(object.annotation);
    setIsLoading(true);
    setPopupOpen(true);

    try {
      const response = await fetch(object.infoURL);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const content = await response.text();
      setPopupContent(content);
    } catch (error) {
      console.error('Error fetching ROI content:', error);
      setError(`Failed to load ROI content: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setPopupContent(`
        <div style="padding: 20px;">
          <h2>Error Loading Content</h2>
          <p>Sorry, we couldn't load the content for ${object.annotation}.</p>
          <p>URL: ${object.infoURL}</p>
        </div>
      `);
    } finally {
      setIsLoading(false);
    }
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
          isLoading={isLoading}
        />
        <Snackbar 
          open={!!error} 
          autoHideDuration={6000} 
          onClose={() => setError(null)}
        >
          <Alert onClose={() => setError(null)} severity="error" sx={{ width: '100%' }}>
            {error}
          </Alert>
        </Snackbar>
      </Container>
    </ThemeProvider>
  );
}

export default App;
