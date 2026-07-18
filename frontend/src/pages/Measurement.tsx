// GPS計測画面

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip,
  Alert,
  FormControlLabel,
  Switch,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Refresh,
  Logout,
} from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { useGPS } from '../hooks/useGPS';
import { formatLapTime } from '../utils/gpsUtils';
import { createLap } from '../api/laps';
import type { LapData } from '../types';

// シミュレーションモードの既定値。
// 本番では実GPSを使うため false。開発時は VITE_GPS_SIMULATION=true で切替可能。
const DEFAULT_SIMULATION =
  import.meta.env.VITE_GPS_SIMULATION === 'true';

export default function Measurement() {
  const navigate = useNavigate();
  const { event, driverName, logout } = useAuthStore();

  // シミュレーションモード切替（計測中は変更不可）
  const [simulationMode, setSimulationMode] = useState(DEFAULT_SIMULATION);

  // 認証チェック
  useEffect(() => {
    if (!event) {
      navigate('/event-login');
    }
  }, [event, navigate]);

  if (!event) return null;

  // v2.2対応: event.courseを使用（後方互換のためevent.circuitも利用可能）
  const course = event.course || event.circuit;

  const {
    running,
    currentLapMs,
    lastLapMs,
    bestLapMs,
    gpsStatus,
    gpsAccuracy,
    laps,
    start,
    stop,
    reset,
  } = useGPS({
    controlLineA: [
      course.controlLineA.lat,
      course.controlLineA.lng,
    ],
    controlLineB: [
      course.controlLineB.lat,
      course.controlLineB.lng,
    ],
    minLapTime: (course.referenceTime || course.referenceLapTime || 30000) / 1000, // ミリ秒→秒に変換
    simulationMode, // 実GPS計測 or シミュレーション（画面上のトグルで切替）
    onLap: async (lap: LapData) => {
      // ラップ記録をサーバーに送信
      try {
        await createLap({
          lapNumber: lap.lapNumber,
          lapTimeMs: lap.lapTimeMs,
          lapTimeStr: lap.lapTimeStr,
        });
        console.log('Lap saved:', lap);
      } catch (error) {
        console.error('Failed to save lap:', error);
      }
    },
  });

  const handleLogout = () => {
    stop();
    logout();
    navigate('/');
  };

  return (
    <Container maxWidth="md" sx={{ mt: 2, pb: 4 }}>
      {/* ヘッダー */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h5" component="h1">
            {event.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {course.name} - {driverName}
          </Typography>
        </Box>
        <Button
          startIcon={<Logout />}
          onClick={handleLogout}
          size="small"
        >
          終了
        </Button>
      </Box>

      {/* GPS状態表示 */}
      <Alert
        severity={gpsAccuracy && gpsAccuracy <= 50 ? 'success' : 'warning'}
        sx={{ mb: 2 }}
      >
        {gpsStatus}
      </Alert>

      {/* 計測モード切替（実GPS / シミュレーション） */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={simulationMode}
              onChange={(e) => setSimulationMode(e.target.checked)}
              disabled={running}
              size="small"
            />
          }
          label={
            <Typography variant="caption" color="text.secondary">
              シミュレーション（動作確認用）
            </Typography>
          }
        />
      </Box>

      {/* タイマー表示 */}
      <Paper sx={{ p: 3, mb: 2, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          現在のラップタイム
        </Typography>
        <Typography variant="h2" component="div" sx={{ fontFamily: 'monospace', fontSize: '3.5rem' }}>
          {formatLapTime(currentLapMs)}
        </Typography>
      </Paper>

      {/* ベスト・ラストラップ */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
        <Paper sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            BEST
          </Typography>
          <Typography variant="h5" sx={{ fontFamily: 'monospace' }}>
            {bestLapMs !== null ? formatLapTime(bestLapMs) : '---'}
          </Typography>
        </Paper>

        <Paper sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            LAST
          </Typography>
          <Typography variant="h5" sx={{ fontFamily: 'monospace' }}>
            {lastLapMs !== null ? formatLapTime(lastLapMs) : '---'}
          </Typography>
        </Paper>
      </Box>

      {/* コントロールボタン */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        {!running ? (
          <Button
            fullWidth
            variant="contained"
            size="large"
            startIcon={<PlayArrow />}
            onClick={start}
          >
            計測開始
          </Button>
        ) : (
          <Button
            fullWidth
            variant="contained"
            color="error"
            size="large"
            startIcon={<Stop />}
            onClick={stop}
          >
            計測停止
          </Button>
        )}

        <Button
          variant="outlined"
          size="large"
          startIcon={<Refresh />}
          onClick={reset}
          disabled={running}
        >
          リセット
        </Button>
      </Box>

      {/* ラップ履歴 */}
      <Typography variant="h6" gutterBottom>
        ラップ履歴 ({laps.length})
      </Typography>
      <Paper>
        <List>
          {laps.length === 0 ? (
            <ListItem>
              <ListItemText
                primary="まだラップが記録されていません"
                secondary="計測を開始してコントロールラインを通過してください"
              />
            </ListItem>
          ) : (
            laps.slice().reverse().map((lap, index) => (
              <ListItem
                key={`${lap.lapNumber}-${index}`}
                divider={index !== laps.length - 1}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label={`LAP ${lap.lapNumber}`} size="small" />
                      <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
                        {lap.lapTimeStr}
                      </Typography>
                      {lap.lapTimeMs === bestLapMs && (
                        <Chip label="BEST" color="primary" size="small" />
                      )}
                    </Box>
                  }
                  secondary={new Date(lap.timestamp).toLocaleTimeString()}
                />
              </ListItem>
            ))
          )}
        </List>
      </Paper>

      {/* ランキングボタン */}
      <Button
        fullWidth
        variant="outlined"
        size="large"
        sx={{ mt: 3 }}
        onClick={() => navigate('/ranking')}
      >
        ランキングを見る
      </Button>
    </Container>
  );
}
