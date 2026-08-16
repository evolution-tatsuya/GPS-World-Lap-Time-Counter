// サブスク案内ページ
// 未加入ユーザーが個人計測を開こうとするとここへ誘導される（入口ブロック）。
// Stripe未連携のため、今は加入メリットの提示＋暫定導線（運営に連絡）を表示。
// 将来 Stripe を繋ぐときは「オンライン決済ボタン」を comingSoon の箇所に置く。

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container, Box, Typography, Button, Paper, List, ListItem,
  ListItemIcon, ListItemText, Alert, Chip, Divider,
} from '@mui/material';
import { CheckCircle, ArrowBack } from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function Subscribe() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, canUsePaid } = useAuthStore();

  const subscribed = canUsePaid();

  return (
    <Container maxWidth="sm" sx={{ mt: 4, pb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <LanguageSwitcher />
      </Box>

      <Typography variant="h4" component="h1" gutterBottom sx={{ color: 'text.primary' }}>
        {t('subscribe.title')}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        {t('subscribe.lead')}
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <List dense>
          {['benefit1', 'benefit2', 'benefit3'].map((k) => (
            <ListItem key={k} disableGutters>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <CheckCircle color="primary" />
              </ListItemIcon>
              <ListItemText primary={t(`subscribe.${k}`)} />
            </ListItem>
          ))}
        </List>
      </Paper>

      {/* 現在の加入状態を明示 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" color="text.secondary">
          {t('subscribe.status')}
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          <Chip
            label={subscribed ? t('subscribe.statusActive') : t('subscribe.statusInactive')}
            color={subscribed ? 'success' : 'default'}
            variant={subscribed ? 'filled' : 'outlined'}
          />
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        {t('subscribe.priceNote')}
      </Alert>

      {/* 暫定導線: 運営に連絡して有効化してもらう（Stripe連携までのつなぎ） */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          {t('subscribe.contactTitle')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('subscribe.contactBody')}
        </Typography>
        <Divider sx={{ my: 2 }} />
        {/* 将来ここに Stripe Checkout ボタンを置く */}
        <Button variant="contained" fullWidth disabled>
          {t('subscribe.comingSoon')}
        </Button>
      </Paper>

      {/* 加入済みなら個人計測へ進めるボタンを出す */}
      {subscribed && (
        <Button
          variant="contained"
          color="secondary"
          fullWidth
          size="large"
          sx={{ mb: 2 }}
          onClick={() => navigate('/personal')}
        >
          {t('personal.title')}
        </Button>
      )}

      <Button
        fullWidth
        startIcon={<ArrowBack />}
        onClick={() => navigate(user ? '/dashboard' : '/')}
      >
        {user ? t('subscribe.backDashboard') : t('subscribe.backHome')}
      </Button>
    </Container>
  );
}
