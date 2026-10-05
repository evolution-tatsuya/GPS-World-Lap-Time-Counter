// ドライバーダッシュボード（/dashboard-live）
//
// 参加者(ドライバー)セッションのイベントを使い、LiveDashboardをdriverモードで表示する。
// 映像は公開視聴トークン(eventCode)で取得する（参加者は運営用viewトークンを使えないため）。
// 配信は計測画面(/measurement)側で継続される。ここは「見る」専用。

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Alert, Button } from '@mui/material';
import { useAuthStore } from '../stores/authStore';
import LiveDashboard from './LiveDashboard';

export default function DriverDashboard() {
  const navigate = useNavigate();
  const { event, isParticipant, isOrganizer } = useAuthStore();

  // 参加者でも運営でもない場合は入口へ
  useEffect(() => {
    if (!isParticipant() && !isOrganizer()) navigate('/event-login');
  }, [isParticipant, isOrganizer, navigate]);

  if (!event) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Alert severity="info" sx={{ mb: 2 }}>イベントに参加するとダッシュボードを表示できます</Alert>
        <Button variant="contained" onClick={() => navigate('/event-login')}>イベントに参加する</Button>
      </Container>
    );
  }

  return (
    <LiveDashboard
      eventId={event.id}
      eventCode={event.eventCode}
      mode="driver"
      eventName={event.name}
      backTo="/measurement"
    />
  );
}
