import React from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, Box, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface PopupDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
  isLoading: boolean;
}

const PopupDialog: React.FC<PopupDialogProps> = ({ open, onClose, title, content, isLoading }) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: 'rgb(255, 255, 255)',
          backdropFilter: 'blur(25px)',
          position: 'fixed',
          top: '50%',
          transform: 'translateY(-50%)',
          margin: 0,
          maxHeight: '80vh'
        }
      }}
    >
      {/* <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          {title}
          <IconButton
            edge="end"
            color="inherit"
            onClick={onClose}
            aria-label="close"
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle> */}
      <DialogContent dividers>
        {isLoading ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
            <CircularProgress />
          </Box>
        ) : (
          <Box
            sx={{
              height: '60vh',
              overflow: 'auto',
              padding: '0 20px',
              '& iframe': {
                width: '100%',
                height: '100%',
                border: 'none',
              },
              color:'rgb(0, 0, 0)'
            }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PopupDialog; 