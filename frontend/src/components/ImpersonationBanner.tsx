// 代理ログイン中バナー
//
// 統括(ADMIN)が運営として代理ログイン中のとき、全ページ上部に警告バナーを出し、
// 「統括に戻る」で元のADMINセッションに復帰する。

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import { useAuthStore } from '../stores/authStore';
import { stopImpersonate } from '../api/admin';

export default function ImpersonationBanner() {
  const navigate = useNavigate();
  const impersonating = useAuthStore((s) => s.impersonating);
  const user = useAuthStore((s) => s.user);
  const setImpersonating = useAuthStore((s) => s.setImpersonating);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const [busy, setBusy] = useState(false);

  if (!impersonating) return null;

  const handleReturn = async () => {
    setBusy(true);
    try {
      await stopImpersonate();
      await restoreSession();
      setImpersonating(false);
      navigate('/admin');
    } catch {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        position: 'sticky', top: 0, zIndex: 1300,
        bgcolor: 'warning.dark', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
        px: 2, py: 0.75, flexWrap: 'wrap',
      }}
    >
      <Typography variant="body2">
        統括として「{user?.name ?? '運営'}」の画面を代理操作中です
      </Typography>
      <Button size="small" variant="contained" color="inherit" onClick={handleReturn} disabled={busy}
        sx={{ color: 'warning.dark', fontWeight: 'bold' }}>
        統括に戻る
      </Button>
    </Box>
  );
}
