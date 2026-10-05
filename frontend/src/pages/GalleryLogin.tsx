// 観客(ギャラリー)入口
//
// イベントコードを入力して観戦ダッシュボード(/live/:code)へ。ログイン不要。
// コードの実在確認は公開API(getEvent)で行い、存在すればダッシュボードへ遷移する。

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, TextField, Button, Alert, CircularProgress,
} from '@mui/material';
import { ArrowBack, Visibility } from '@mui/icons-material';
import { getEvent } from '../api/events';

export default function GalleryLogin() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) { setError('イベントコードを入力してください'); return; }
    setLoading(true);
    setError('');
    try {
      // 実在確認（公開API。idでもcodeでも解決される）
      await getEvent(normalized);
      navigate(`/live/${encodeURIComponent(normalized)}`);
    } catch {
      setError('イベントが見つかりません。コードをご確認ください');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 6 }}>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/')} sx={{ mb: 2 }}>戻る</Button>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Visibility sx={{ fontSize: 48, color: 'primary.main' }} />
        <Typography variant="h5" component="h1" sx={{ fontWeight: 'bold', mt: 1 }}>
          観戦する
        </Typography>
        <Typography variant="body2" color="text.secondary">
          イベントコードを入力すると、車載映像・順位・ラップタイムを観戦できます
        </Typography>
      </Box>

      <Box component="form" onSubmit={handleSubmit}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField
          fullWidth
          label="イベントコード"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="例: ABC123"
          autoCapitalize="characters"
          autoComplete="off"
          slotProps={{ htmlInput: { style: { textTransform: 'uppercase', letterSpacing: 2, fontSize: 20, textAlign: 'center' } } }}
          helperText="イベントコードに I・L・O は使用していません"
          sx={{ mb: 2 }}
        />
        <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
          {loading ? <CircularProgress size={24} /> : '観戦をはじめる'}
        </Button>
      </Box>
    </Container>
  );
}
