// イベントコードログインページ

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { EventLoginResponse } from '../types';

export default function EventLogin() {
  const navigate = useNavigate();
  const setEventSession = useAuthStore((state) => state.setEventSession);

  const [eventCode, setEventCode] = useState('');
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
        eventCode: eventCode.toUpperCase(),
        driverName,
        vehicle: vehicle || undefined,
      });

      setEventSession(response.event, driverName, vehicle);
      navigate('/measurement');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        イベント参加
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        運営者から配布されたイベントコードを入力してください
      </Typography>

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField
          fullWidth
          label="イベントコード"
          value={eventCode}
          onChange={(e) => setEventCode(e.target.value)}
          placeholder="ABC123"
          required
          sx={{ mb: 2 }}
          inputProps={{ maxLength: 6, style: { textTransform: 'uppercase' } }}
        />

        <TextField
          fullWidth
          label="ドライバー名"
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          required
          sx={{ mb: 2 }}
        />

        <TextField
          fullWidth
          label="車両名（任意）"
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
          placeholder="例: FD2 CIVIC TYPE R"
          sx={{ mb: 3 }}
        />

        <Button
          type="submit"
          fullWidth
          variant="contained"
          size="large"
          disabled={loading || !eventCode || !driverName}
        >
          {loading ? '接続中...' : 'イベントに参加'}
        </Button>

        <Button
          fullWidth
          onClick={() => navigate('/')}
          sx={{ mt: 2 }}
        >
          戻る
        </Button>
      </Box>
    </Container>
  );
}
