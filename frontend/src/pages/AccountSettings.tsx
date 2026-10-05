// アカウント設定（運営者・本人）
//
// ログイン中のユーザーが自分のメールアドレス・表示名・パスワードを変更する。
// パスワード変更は現在のパスワード確認を必須にする（PUT /api/auth/me）。

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, Button, Paper, Stack, TextField, Alert, Divider, CircularProgress,
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { apiClient } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import type { User } from '../types';

export default function AccountSettings() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Alert severity="info">ログインが必要です</Alert>
        <Button sx={{ mt: 2 }} variant="contained" onClick={() => navigate('/login')}>ログインへ</Button>
      </Container>
    );
  }

  const handleSave = async () => {
    setError('');
    setSuccess('');
    if (newPassword && newPassword.length < 8) {
      setError('新しいパスワードは8文字以上にしてください'); return;
    }
    if (newPassword && !currentPassword) {
      setError('パスワード変更には現在のパスワードが必要です'); return;
    }
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (name.trim() && name.trim() !== user.name) payload.name = name.trim();
      if (email.trim() && email.trim() !== (user.email ?? '')) payload.email = email.trim();
      if (newPassword) { payload.currentPassword = currentPassword; payload.newPassword = newPassword; }
      if (Object.keys(payload).length === 0) { setError('変更する項目がありません'); setSaving(false); return; }

      const res = await apiClient.put<{ user: User }>('/auth/me', payload);
      setUser({ ...user, ...res.user });
      setSuccess('アカウント情報を更新しました');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 3, mb: 6 }}>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/dashboard')} sx={{ mb: 2 }}>戻る</Button>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 'bold', mb: 2 }}>アカウント設定</Typography>

      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}

          <Typography variant="subtitle2" color="text.secondary">基本情報</Typography>
          <TextField label="表示名" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <TextField label="メールアドレス（ログインID）" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />

          <Divider sx={{ my: 1 }} />
          <Typography variant="subtitle2" color="text.secondary">パスワード変更（任意）</Typography>
          <TextField label="現在のパスワード" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} fullWidth autoComplete="current-password" />
          <TextField label="新しいパスワード（8文字以上）" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} fullWidth autoComplete="new-password" />

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? <CircularProgress size={20} /> : '保存'}
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Container>
  );
}
