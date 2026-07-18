// 運営者ダッシュボード

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Event as EventIcon,
  DirectionsCar,
  Timer,
  People,
  Logout,
  Add,
} from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { getEvents } from '../api/events';
import { getCircuits } from '../api/circuits';
import type { Event, Circuit } from '../types';

interface DashboardStats {
  totalEvents: number;
  activeEvents: number;
  totalCircuits: number;
  totalLaps: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, isOrganizer, logout } = useAuthStore();

  const [currentTab, setCurrentTab] = useState(0);
  const [events, setEvents] = useState<Event[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalEvents: 0,
    activeEvents: 0,
    totalCircuits: 0,
    totalLaps: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 認証チェック
  useEffect(() => {
    if (!isOrganizer()) {
      navigate('/login');
    }
  }, [isOrganizer, navigate]);

  // データ取得
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [eventsData, circuitsData] = await Promise.all([
        getEvents(),
        getCircuits(),
      ]);

      setEvents(eventsData);
      setCircuits(circuitsData);

      // 統計計算
      const now = new Date();
      const activeEventsCount = eventsData.filter(
        (event) => {
          const eventDate = new Date(event.eventDate);
          // イベント当日をアクティブとみなす
          return eventDate.toDateString() === now.toDateString();
        }
      ).length;

      setStats({
        totalEvents: eventsData.length,
        activeEvents: activeEventsCount,
        totalCircuits: circuitsData.length,
        totalLaps: 0, // TODO: ラップ数を取得するAPIを追加
      });
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError('ダッシュボードデータの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const getEventStatus = (event: Event) => {
    const now = new Date();
    const eventDate = new Date(event.eventDate);

    // イベント当日を開催中、過去を終了、未来を予定とみなす
    const today = now.toDateString();
    const eventDay = eventDate.toDateString();

    if (today === eventDay) {
      return { label: '開催中', color: 'success' as const };
    } else if (now < eventDate) {
      return { label: '予定', color: 'default' as const };
    } else {
      return { label: '終了', color: 'error' as const };
    }
  };

  if (!isOrganizer()) return null;

  return (
    <Container maxWidth="lg" sx={{ mt: 2, pb: 4 }}>
      {/* ヘッダー */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <DashboardIcon sx={{ mr: 1, color: 'primary.main', fontSize: 32 }} />
          <Box>
            <Typography variant="h4" component="h1">
              運営者ダッシュボード
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.name} ({user?.email})
            </Typography>
          </Box>
        </Box>
        <Button
          startIcon={<Logout />}
          onClick={handleLogout}
          variant="outlined"
        >
          ログアウト
        </Button>
      </Box>

      {/* ローディング */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {/* エラー */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* ダッシュボード内容 */}
      {!loading && !error && (
        <>
          {/* 統計カード */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <EventIcon color="primary" />
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      総イベント数
                    </Typography>
                  </Box>
                  <Typography variant="h3" component="div">
                    {stats.totalEvents}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Timer color="success" />
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      開催中
                    </Typography>
                  </Box>
                  <Typography variant="h3" component="div" color="success.main">
                    {stats.activeEvents}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <DirectionsCar color="info" />
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      登録サーキット数
                    </Typography>
                  </Box>
                  <Typography variant="h3" component="div">
                    {stats.totalCircuits}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <People color="warning" />
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      総ラップ数
                    </Typography>
                  </Box>
                  <Typography variant="h3" component="div">
                    {stats.totalLaps}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* タブ */}
          <Paper sx={{ mb: 2 }}>
            <Tabs value={currentTab} onChange={handleTabChange}>
              <Tab label="イベント管理" />
              <Tab label="サーキット管理" />
            </Tabs>
          </Paper>

          {/* イベント管理タブ */}
          {currentTab === 0 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">イベント一覧</Typography>
                <Button
                  startIcon={<Add />}
                  variant="contained"
                  onClick={() => navigate('/events/create')}
                >
                  新規イベント作成
                </Button>
              </Box>

              {events.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="body1" color="text.secondary">
                    まだイベントが登録されていません
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    sx={{ mt: 2 }}
                    onClick={() => navigate('/events/create')}
                  >
                    最初のイベントを作成
                  </Button>
                </Paper>
              ) : (
                <Grid container spacing={2}>
                  {events.map((event) => {
                    const status = getEventStatus(event);
                    return (
                      <Grid item xs={12} md={6} key={event.id}>
                        <Card
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { boxShadow: 4 }
                          }}
                          onClick={() => navigate(`/events/${event.id}`)}
                        >
                          <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                              <Typography variant="h6">{event.name}</Typography>
                              <Chip label={status.label} color={status.color} size="small" />
                            </Box>
                            <Typography variant="body2" color="text.secondary" gutterBottom>
                              イベントコード: {event.eventCode}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              サーキット: {event.circuit?.name || '未設定'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              開催日: {new Date(event.eventDate).toLocaleDateString()}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              )}
            </Box>
          )}

          {/* サーキット管理タブ */}
          {currentTab === 1 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">サーキット一覧</Typography>
                <Button
                  startIcon={<Add />}
                  variant="contained"
                  onClick={() => navigate('/circuits/create')}
                >
                  新規サーキット登録
                </Button>
              </Box>

              {circuits.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="body1" color="text.secondary">
                    まだサーキットが登録されていません
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    sx={{ mt: 2 }}
                    onClick={() => navigate('/circuits/create')}
                  >
                    最初のサーキットを登録
                  </Button>
                </Paper>
              ) : (
                <Grid container spacing={2}>
                  {circuits.map((circuit) => (
                    <Grid item xs={12} md={6} key={circuit.id}>
                      <Card
                        sx={{
                          cursor: 'pointer',
                          '&:hover': { boxShadow: 4 }
                        }}
                        onClick={() => navigate(`/circuits/${circuit.id}`)}
                      >
                        <CardContent>
                          <Typography variant="h6" gutterBottom>
                            {circuit.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            所在地: {circuit.country} {circuit.state && `- ${circuit.state}`}
                          </Typography>
                          {circuit.referenceLapTime && (
                            <Typography variant="body2" color="text.secondary">
                              基準ラップタイム: {circuit.referenceLapTime}秒
                            </Typography>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          )}
        </>
      )}
    </Container>
  );
}
