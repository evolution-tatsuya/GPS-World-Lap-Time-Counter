// アカウント登録ページ
// バックエンドの /auth/register はセッションを張らないため、
// 登録成功後に同じ資格情報で自動ログインし、意図した遷移先へ進める。

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  Link,
} from '@mui/material';
import { useAuthStore } from '../stores/authStore';
import { apiClient } from '../api/client';
import LanguageSwitcher from '../components/LanguageSwitcher';
import type { User } from '../types';

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const setUser = useAuthStore((state) => state.setUser);

  // 登録後の遷移先。トップの「個人で計測」経由なら /personal、通常は /dashboard。
  const requested = (location.state as { redirect?: string } | null)?.redirect;
  const redirectTo = requested === '/personal' ? '/personal' : '/dashboard';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // バックエンドと同じく8文字以上を要求（送信前に弾いて分かりやすく）
    if (password.length < 8) {
      setError(t('register.passwordTooShort'));
      return;
    }

    setLoading(true);
    try {
      // 1. 登録
      await apiClient.post<{ user: User }>('/auth/register', {
        email,
        password,
        name,
      });
      // 2. 自動ログイン（登録APIはセッションを張らないため）
      const login = await apiClient.post<{ user: User }>('/auth/login', {
        email,
        password,
      });
      setUser(login.user);
      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('register.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <LanguageSwitcher />
      </Box>

      <Typography variant="h4" component="h1" gutterBottom sx={{ color: 'text.primary' }}>
        {t('register.title')}
      </Typography>

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField
          fullWidth
          label={t('register.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          sx={{ mb: 2 }}
        />

        <TextField
          fullWidth
          label={t('register.email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          sx={{ mb: 2 }}
        />

        <TextField
          fullWidth
          label={t('register.password')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          helperText={t('register.passwordHint')}
          sx={{ mb: 3 }}
        />

        <Button
          type="submit"
          fullWidth
          variant="contained"
          size="large"
          disabled={loading || !email || !password || !name}
        >
          {loading ? t('register.submitting') : t('register.submit')}
        </Button>

        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={() => navigate('/login', { state: requested ? { redirect: requested } : undefined })}
          >
            {t('register.haveAccount')}
          </Link>
        </Box>

        <Button fullWidth onClick={() => navigate('/')} sx={{ mt: 2 }}>
          {t('common.back')}
        </Button>
      </Box>
    </Container>
  );
}
