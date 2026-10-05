// 観客ダッシュボード（/live/:code）
//
// URLのイベントコードからイベントを解決し、LiveDashboardをgalleryモードで表示する。
// ログイン不要。映像は公開視聴トークン（eventCode）で取得する。

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Container, CircularProgress, Alert, Box } from '@mui/material';
import { getEvent } from '../api/events';
import LiveDashboard from './LiveDashboard';
import type { Event } from '../types';

export default function GalleryDashboard() {
  const { code } = useParams<{ code: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    getEvent(code)
      .then((data) => { if (!cancelled) setEvent(data); })
      .catch(() => { if (!cancelled) setError('イベントが見つかりません'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [code]);

  if (loading) {
    return <Container sx={{ mt: 8, textAlign: 'center' }}><CircularProgress /></Container>;
  }
  if (error || !event) {
    return <Container maxWidth="sm" sx={{ mt: 6 }}><Alert severity="error">{error || 'イベントが見つかりません'}</Alert></Container>;
  }

  return (
    <Box>
      <LiveDashboard
        eventId={event.id}
        eventCode={code}
        mode="gallery"
        eventName={event.name}
        backTo="/gallery"
      />
    </Box>
  );
}
