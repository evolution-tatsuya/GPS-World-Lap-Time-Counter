// GPS計測画面

import { useEffect, useState, useRef } from 'react';
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
  TextField,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Refresh,
  Logout,
  MyLocation,
} from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { useGPS } from '../hooks/useGPS';
import { formatLapTime } from '../utils/gpsUtils';
import { createLap } from '../api/laps';
import { sendPosition } from '../api/positions';
import type { LapData, GPSPosition } from '../types';

// 位置共有の送信間隔（ミリ秒）。GPSは頻繁に更新されるため間引く。
const POSITION_SEND_INTERVAL_MS = 5000;

// シミュレーションモードの既定値。
// 本番では実GPSを使うため false。開発時は VITE_GPS_SIMULATION=true で切替可能。
const DEFAULT_SIMULATION =
  import.meta.env.VITE_GPS_SIMULATION === 'true';

export default function Measurement() {
  const navigate = useNavigate();
  const { event, driverName, logout } = useAuthStore();

  // シミュレーションモード切替（計測中は変更不可）
  const [simulationMode, setSimulationMode] = useState(DEFAULT_SIMULATION);
  // 片道モード切替（ON=片道／同一方向の通過のみ、OFF=往復・周回）
  const [oneWay, setOneWay] = useState(false);

  // 追加入力項目（任意）・セッション名。計測前に入力してラップに付与する。
  const [sessionName, setSessionName] = useState('');
  const [zekken, setZekken] = useState('');
  const [klass, setKlass] = useState('');
  const [tire, setTire] = useState('');
  const [note, setNote] = useState('');

  // 現在地を主催者と共有するか（計測とは独立。参加者自身の意思でON/OFF）
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState<string>('');

  // 位置共有の送信スロットル用（最後に送った時刻）
  const lastPositionSentRef = useRef(0);

  // 位置更新のたびに呼ばれる。一定間隔に間引いて主催者へ送信する。
  // 開催時間外はサーバー側が拒否する（フロントは常に送ってよい）。
  const sendThrottledPosition = (lat: number, lng: number, accuracy?: number) => {
    const now = Date.now();
    if (now - lastPositionSentRef.current < POSITION_SEND_INTERVAL_MS) return;
    lastPositionSentRef.current = now;
    sendPosition({ lat, lng, accuracy }).catch(() => {
      // 送信失敗（開催時間外403や一時的な通信断）は握りつぶす。
    });
  };

  // 計測フックからの位置更新（計測中のみ発火）
  const handlePosition = (pos: GPSPosition) => {
    // 独立した共有ボタンがONのときだけ送る（計測=常時共有ではない）
    if (sharing) {
      sendThrottledPosition(pos.lat, pos.lng, pos.accuracy);
    }
  };

  // 共有トグルがONの間、計測とは独立してGPSを監視し位置を送信する。
  // これにより「計測していない待機中」でも参加者の意思で共有できる。
  useEffect(() => {
    if (!sharing) {
      setShareStatus('');
      return;
    }
    if (!('geolocation' in navigator)) {
      setShareStatus('この端末は位置情報に対応していません');
      setSharing(false);
      return;
    }
    setShareStatus('現在地を共有中…');
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        sendThrottledPosition(
          position.coords.latitude,
          position.coords.longitude,
          position.coords.accuracy
        );
        setShareStatus(`現在地を共有中（精度±${Math.round(position.coords.accuracy)}m）`);
      },
      (err) => {
        setShareStatus(
          err.code === err.PERMISSION_DENIED
            ? '位置情報が許可されていません。共有を停止しました'
            : '位置情報を取得できませんでした'
        );
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing]);

  // 認証チェック
  useEffect(() => {
    if (!event) {
      navigate('/event-login');
    }
  }, [event, navigate]);

  if (!event) return null;

  // v2.2対応: event.courseを使用（後方互換のためevent.circuitも利用可能）
  const course = event.course || event.circuit;

  // コントロールライン座標が欠けている場合は計測できないため、安全に案内を表示
  if (!course || !course.controlLineA || !course.controlLineB) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          コース情報（コントロールライン座標）が取得できませんでした。
          お手数ですが、一度ログインし直してください。
        </Alert>
        <Button variant="outlined" onClick={() => navigate('/event-login')}>
          イベントログインへ
        </Button>
      </Container>
    );
  }

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
    oneWay, // 周回モードで逆方向通過を無視（従来フラグ）
    sessionName, // 任意のセッション名（ラップに付与）
    onPosition: handlePosition, // 位置共有（主催者へ送信）
    onLap: async (lap: LapData) => {
      // ラップ記録をサーバーに送信（セッション・追加項目も付与）
      try {
        await createLap({
          lapNumber: lap.lapNumber,
          lapTimeMs: lap.lapTimeMs,
          lapTimeStr: lap.lapTimeStr,
          sessionId: lap.sessionId,
          sessionName: lap.sessionName,
          zekken: zekken || undefined,
          klass: klass || undefined,
          tire: tire || undefined,
          note: note || undefined,
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

      {/* 現在地の共有（計測とは独立。参加者自身の意思でON/OFF） */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MyLocation color={sharing ? 'primary' : 'disabled'} />
            <Box>
              <Typography variant="body2" fontWeight="medium">
                現在地を主催者と共有
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {sharing
                  ? shareStatus || '現在地を共有中…'
                  : 'OFFの間は主催者に位置は送られません'}
              </Typography>
            </Box>
          </Box>
          <Switch
            checked={sharing}
            onChange={(e) => setSharing(e.target.checked)}
            color="primary"
          />
        </Box>
        {sharing && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            ※ イベント開催時間内のみ主催者に表示されます。時間外は送られません。
          </Typography>
        )}
      </Paper>

      {/* 計測モード切替 */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          mb: 2,
        }}
      >
        <FormControlLabel
          control={
            <Switch
              checked={oneWay}
              onChange={(e) => setOneWay(e.target.checked)}
              disabled={running}
              size="small"
            />
          }
          label={
            <Typography variant="caption" color="text.secondary">
              {oneWay ? '片道モード（同一方向のみ）' : '周回・往復モード'}
            </Typography>
          }
        />
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

      {/* 計測情報の入力（計測前のみ。ラップに付与される。すべて任意） */}
      {!running && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'medium' }}>
            計測情報（任意）
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="セッション名"
              placeholder="例：午前フリー走行"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              sx={{ flex: '1 1 45%' }}
            />
            <TextField
              size="small"
              label="ゼッケン"
              placeholder="例：26"
              value={zekken}
              onChange={(e) => setZekken(e.target.value)}
              sx={{ flex: '1 1 45%' }}
            />
            <TextField
              size="small"
              label="クラス"
              placeholder="例：NA1"
              value={klass}
              onChange={(e) => setKlass(e.target.value)}
              sx={{ flex: '1 1 45%' }}
            />
            <TextField
              size="small"
              label="タイヤ・天候"
              placeholder="例：71RS/ドライ"
              value={tire}
              onChange={(e) => setTire(e.target.value)}
              sx={{ flex: '1 1 45%' }}
            />
            <TextField
              size="small"
              label="メモ"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              sx={{ flex: '1 1 100%' }}
            />
          </Box>
        </Paper>
      )}

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
