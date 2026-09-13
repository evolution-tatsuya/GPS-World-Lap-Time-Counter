// イベントコードログインページ

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Box,
  TextField,
  Button,
  Typography,
  Alert,
} from '@mui/material';
import { useAuthStore } from '../stores/authStore';
import { apiClient } from '../api/client';
import LanguageSwitcher from '../components/LanguageSwitcher';
import type { EventLoginResponse } from '../types';

export default function EventLogin() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const setEventSession = useAuthStore((state) => state.setEventSession);

  // イベントコードは uncontrolled（value を渡さず ref から読む）。
  // controlled + onChange の toUpperCase 差し替えは、iOSの予測変換と併さって
  // カーソルが飛び「打ちながら削除できない/累積する」不具合の原因になるため。
  // 大文字表示は CSS(textTransform)、値の大文字化は送信時に行う。
  const codeRef = useRef<HTMLInputElement>(null);
  const [codeEmpty, setCodeEmpty] = useState(true);
  const [driverName, setDriverName] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiClient.post<EventLoginResponse>('/auth/event-login', {
        eventCode: (codeRef.current?.value ?? '').trim().toUpperCase(),
        driverName,
        vehicle: vehicle || undefined,
      });

      setEventSession(response.event, driverName, vehicle);
      navigate('/measurement');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('eventLogin.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      {/* 言語選択（ログイン前に選ぶ。以降のページに反映される） */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <LanguageSwitcher />
      </Box>

      <Typography variant="h4" component="h1" gutterBottom>
        {t('eventLogin.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('eventLogin.description')}
      </Typography>

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField
          fullWidth
          label={t('eventLogin.eventCode')}
          inputRef={codeRef}
          defaultValue=""
          onChange={(e) => setCodeEmpty(e.target.value.trim() === '')}
          placeholder="ABC123"
          required
          sx={{ mb: 2 }}
          slotProps={{
            htmlInput: {
              maxLength: 6,
              // iOSの予測変換/自動修正で「打ちながら削除できない/累積する」不具合を防ぐ。
              autoCapitalize: 'characters',
              autoComplete: 'one-time-code',
              autoCorrect: 'off',
              spellCheck: false,
              inputMode: 'text',
              // 大文字は表示のみCSSで行う（値の書き換えはしない＝カーソルが飛ばない）。
              style: { textTransform: 'uppercase' }
            }
          }}
        />

        <TextField
          fullWidth
          label={t('eventLogin.driverName')}
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          required
          sx={{ mb: 2 }}
        />

        <TextField
          fullWidth
          label={t('eventLogin.vehicle')}
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
          placeholder="例: FD2 CIVIC TYPE R"
          required
          sx={{ mb: 3 }}
        />

        <Button
          type="submit"
          fullWidth
          variant="contained"
          size="large"
          disabled={loading || codeEmpty || !driverName || !vehicle}
        >
          {loading ? t('eventLogin.joining') : t('eventLogin.join')}
        </Button>

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
