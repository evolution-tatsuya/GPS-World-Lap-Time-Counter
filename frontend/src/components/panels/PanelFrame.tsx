// パネル共通枠（ヘッダ付きPaper）
// ダッシュボードの各パネルを統一した見た目で囲む。右上に閉じるボタン。

import type { ReactNode } from 'react';
import { Paper, Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface PanelFrameProps {
  title: string;
  onClose?: () => void;
  headerRight?: ReactNode;
  children: ReactNode;
  // 映像など中身を黒背景・パディングなしにしたいとき
  flush?: boolean;
}

export default function PanelFrame({ title, onClose, headerRight, children, flush }: PanelFrameProps) {
  return (
    <Paper
      elevation={2}
      sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}
    >
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
          borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default', flex: '0 0 auto',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </Typography>
        {headerRight}
        {onClose && (
          <IconButton size="small" onClick={onClose} aria-label="close panel">
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: flush ? 'hidden' : 'auto', p: flush ? 0 : 1.5, bgcolor: flush ? '#000' : 'background.paper' }}>
        {children}
      </Box>
    </Paper>
  );
}
