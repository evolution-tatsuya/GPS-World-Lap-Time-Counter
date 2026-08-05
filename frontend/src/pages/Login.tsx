// 運営者ログインページ

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

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const setUser = useAuthStore((state) => state.setUser);

  // ログイン後の遷移先。トップの「個人で計測」から来た場合は /personal、
  // 通常（運営者ログイン）は /dashboard。許可リストで外部/不正遷移を防ぐ。
  const requested = (location.state as { redirect?: string } | null)?.redirect;
  const redirectTo = requested === '/personal' ? '/personal' : '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiClient.post<{ user: User }>('/auth/login', {
        email,
        password,
      });

      setUser(response.user);
      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <LanguageSwitcher />
      </Box>

      <Typography variant="h4" component="h1" gutterBottom>
        {t('login.title')}
      </Typography>

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField
          fullWidth
          label={t('login.email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          sx={{ mb: 2 }}
        />

        <TextField
          fullWidth
          label={t('login.password')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          sx={{ mb: 3 }}
        />

        <Button
          type="submit"
          fullWidth
          variant="contained"
          size="large"
          disabled={loading || !email || !password}
        >
          {loading ? t('login.submitting') : t('login.submit')}
        </Button>

        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Link href="/register" underline="hover">
            {t('login.register')}
          </Link>
        </Box>

        <Button
          fullWidth
          onClick={() => navigate('/')}
          sx={{ mt: 2 }}
        >
          {t('common.back')}
        </Button>
      </Box>
    </Container>
  );
}
