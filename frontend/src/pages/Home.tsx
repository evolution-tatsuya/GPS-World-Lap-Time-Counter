// ホームページ

import { Container, Typography, Button, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
      <Typography variant="h3" component="h1" gutterBottom>
        GPS World Lap Time Counter
      </Typography>
      <Typography variant="h6" color="text.secondary" paragraph>
        モータースポーツイベントのラップタイム計測プラットフォーム
      </Typography>

      <Box sx={{ mt: 6, display: 'flex', gap: 2, justifyContent: 'center' }}>
        <Button
          variant="contained"
          size="large"
          onClick={() => navigate('/event-login')}
        >
          イベント参加者
        </Button>
        <Button
          variant="outlined"
          size="large"
          onClick={() => navigate('/login')}
        >
          運営者ログイン
        </Button>
      </Box>
    </Container>
  );
}
