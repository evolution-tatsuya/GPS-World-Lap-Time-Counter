// ホームページ

import { Container, Typography, Button, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function Home() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
      {/* 言語選択（入口に置く。以降のページに反映される） */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <LanguageSwitcher />
      </Box>

      <Typography variant="h3" component="h1" gutterBottom>
        {t('app.name')}
      </Typography>
      <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
        {t('home.tagline')}
      </Typography>

      <Box sx={{ mt: 6, display: 'flex', gap: 2, justifyContent: 'center' }}>
        <Button
          variant="contained"
          size="large"
          onClick={() => navigate('/event-login')}
        >
          {t('home.participant')}
        </Button>
        <Button
          variant="outlined"
          size="large"
          onClick={() => navigate('/login')}
        >
          {t('home.organizer')}
        </Button>
      </Box>
    </Container>
  );
}
