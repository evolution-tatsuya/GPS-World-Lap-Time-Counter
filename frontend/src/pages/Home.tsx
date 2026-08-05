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

      <Typography
        variant="h3"
        component="h1"
        gutterBottom
        sx={{ color: 'text.primary', fontWeight: 700 }}
      >
        {t('app.name')}
      </Typography>
      <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
        {t('home.tagline')}
      </Typography>

      <Box
        sx={{
          mt: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          alignItems: 'stretch',
          maxWidth: 360,
          mx: 'auto',
        }}
      >
        {/* イベントに参加（無料・イベントコード） */}
        <Button
          variant="contained"
          size="large"
          onClick={() => navigate('/event-login')}
        >
          {t('home.participant')}
        </Button>
        {/* 個人で計測（課金者向け。ログイン後 /personal へ直行） */}
        <Button
          variant="contained"
          color="secondary"
          size="large"
          onClick={() => navigate('/login', { state: { redirect: '/personal' } })}
        >
          {t('home.personal')}
        </Button>
        {/* 運営者・統括ログイン */}
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
