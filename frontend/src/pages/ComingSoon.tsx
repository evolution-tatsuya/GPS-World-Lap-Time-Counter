// 準備中ページ

import { useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
} from '@mui/material';
import {
  ArrowBack,
  Construction,
} from '@mui/icons-material';

export default function ComingSoon() {
  const navigate = useNavigate();
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/events/create')) return 'イベント作成';
    if (path.includes('/events/')) return 'イベント詳細';
    if (path.includes('/circuits/create')) return 'サーキット登録';
    if (path.includes('/circuits/')) return 'サーキット詳細';
    return 'ページ';
  };

  return (
    <Container maxWidth="md" sx={{ mt: 8 }}>
      <Paper
        sx={{
          p: 6,
          textAlign: 'center',
          background: 'linear-gradient(135deg, #1E1E1E 0%, #2D2D2D 100%)',
        }}
      >
        <Box sx={{ mb: 4 }}>
          <Construction
            sx={{
              fontSize: 120,
              color: 'primary.main',
              mb: 2,
            }}
          />
        </Box>

        <Typography variant="h3" gutterBottom>
          {getPageTitle()}
        </Typography>

        <Typography variant="h5" color="text.secondary" gutterBottom sx={{ mb: 4 }}>
          準備中
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          このページは現在開発中です。
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          将来のバージョンでご利用いただけるようになります。
        </Typography>

        <Button
          variant="contained"
          size="large"
          startIcon={<ArrowBack />}
          onClick={() => navigate('/dashboard')}
        >
          ダッシュボードに戻る
        </Button>
      </Paper>
    </Container>
  );
}
