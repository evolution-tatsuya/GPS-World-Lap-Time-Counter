// 個人計測ページ（ログインユーザー＝サブスク課金者がイベントなしで計測）
// 承認済みコースを選び、useGPSで計測、各ラップを個人記録(eventIdなし)としてDB保存する。

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container, Box, Typography, Button, Paper, MenuItem, TextField,
  Alert, List, ListItem, ListItemText, Chip, FormControlLabel, Switch,
} from '@mui/material';
import { PlayArrow, Stop, Refresh, ArrowBack } from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { useGPS } from '../hooks/useGPS';
import { formatLapTime } from '../utils/gpsUtils';
import { getCircuits } from '../api/circuits';
import { getPersonalLaps, type PersonalLapsResult } from '../api/laps';
import { enqueuePersonalLap, flushQueue, pendingCount } from '../utils/personalLapQueue';
import type { Circuit, LapData } from '../types';

const DEFAULT_SIMULATION = import.meta.env.VITE_GPS_SIMULATION === 'true';

export default function PersonalMeasurement() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, isOrganizer } = useAuthStore();

  const [courses, setCourses] = useState<Circuit[]>([]);
  const [courseId, setCourseId] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [simulationMode, setSimulationMode] = useState(DEFAULT_SIMULATION);
  const [error, setError] = useState('');
  const [personal, setPersonal] = useState<PersonalLapsResult>({ best: null, laps: [] });
  const [pending, setPending] = useState(0);

  // ログイン必須（未ログインはログインへ）
  useEffect(() => {
    if (!isOrganizer()) navigate('/login');
  }, [isOrganizer, navigate]);

  // 承認済み・公開コース一覧を取得
  useEffect(() => {
    getCircuits().then(setCourses).catch(() => setError(t('personal.loadFailed')));
  }, [t]);

  // 選択コースの自分の記録を読み込む
  const reloadPersonal = (cid: string) => {
    if (!cid) { setPersonal({ best: null, laps: [] }); return; }
    getPersonalLaps(cid).then(setPersonal).catch(() => {});
  };
  useEffect(() => { reloadPersonal(courseId); }, [courseId]);

  // 未送信の自動再送: 起動時＋15秒毎＋画面復帰時。電波復帰でまとめて届く。
  useEffect(() => {
    const tryFlush = async () => {
      const { pending: remain, needsSubscription } = await flushQueue();
      setPending(remain);
      if (needsSubscription) setError(t('personal.subRequired'));
      if (remain === 0 && courseId) reloadPersonal(courseId);
    };
    setPending(pendingCount());
    tryFlush();
    const iv = window.setInterval(tryFlush, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') tryFlush(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const course = courses.find((c) => c.id === courseId);

  const gps = useGPS({
    controlLineA: course ? [course.controlLineA.lat, course.controlLineA.lng] : [0, 0],
    controlLineB: course ? [course.controlLineB.lat, course.controlLineB.lng] : [0, 0],
    minLapTime: (course?.referenceTime || course?.referenceLapTime || 30000) / 1000,
    mode: course?.measureType === 'ONE_WAY' && course.goalLineA && course.goalLineB ? 'oneway' : 'lap',
    goalLineA: course?.goalLineA ? [course.goalLineA.lat, course.goalLineA.lng] : undefined,
    goalLineB: course?.goalLineB ? [course.goalLineB.lat, course.goalLineB.lng] : undefined,
    simulationMode,
    onLap: async (lap: LapData) => {
      if (!courseId) return;
      // 堅牢送信: まずキューに保存してから送信を試みる（電波弱でも失わない）
      enqueuePersonalLap(courseId, {
        lapNumber: lap.lapNumber,
        lapTimeMs: lap.lapTimeMs,
        lapTimeStr: lap.lapTimeStr,
        sessionId: lap.sessionId,
        sessionName: lap.sessionName,
      }, vehicle || undefined);
      const { pending: remain, needsSubscription } = await flushQueue();
      setPending(remain);
      if (needsSubscription) setError(t('personal.subRequired'));
      reloadPersonal(courseId); // ベスト/履歴を更新
    },
  });

  return (
    <Container maxWidth="md" sx={{ mt: 2, pb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/dashboard')} sx={{ mr: 1 }}>
          {t('personal.backToDashboard')}
        </Button>
        <Typography variant="h5" component="h1">{t('personal.title')}</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* コース選択 */}
      {!gps.running && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <TextField
            select fullWidth label={t('personal.selectCourse')}
            value={courseId} onChange={(e) => setCourseId(e.target.value)}
            sx={{ mb: 2 }}
          >
            {courses.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}（{c.country}{c.state ? ` / ${c.state}` : ''}）
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth size="small" label={t('personal.vehicle')}
            value={vehicle} onChange={(e) => setVehicle(e.target.value)}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {t('personal.courseInfo')}
          </Typography>
          {DEFAULT_SIMULATION && (
            <FormControlLabel
              sx={{ mt: 1 }}
              control={<Switch checked={simulationMode} onChange={(e) => setSimulationMode(e.target.checked)} />}
              label="Simulation"
            />
          )}
        </Paper>
      )}

      {/* GPS状態＋タイマー */}
      <Alert severity={gps.gpsAccuracy && gps.gpsAccuracy <= 50 ? 'success' : 'warning'} sx={{ mb: 2 }}>
        {gps.gpsStatus}
      </Alert>

      {/* 未送信ラップ（電波弱で送れなかった分の手動再送） */}
      {pending > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={async () => setPending((await flushQueue()).pending)}>
              {t('personal.sendNow')}
            </Button>
          }
        >
          {t('personal.pending', { count: pending })}
        </Alert>
      )}

      <Paper sx={{ p: 3, textAlign: 'center', mb: 2 }}>
        <Typography variant="caption" color="text.secondary">CURRENT LAP</Typography>
        <Typography variant="h3" sx={{ fontFamily: 'monospace' }}>
          {gps.running
            ? (gps.currentLapMs ? formatLapTime(gps.currentLapMs) : t('personal.waiting'))
            : '--:--.---'}
        </Typography>
      </Paper>

      {/* 操作ボタン */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        {!gps.running ? (
          <Button
            fullWidth variant="contained" size="large" startIcon={<PlayArrow />}
            onClick={gps.start} disabled={!courseId}
          >
            {t('personal.start')}
          </Button>
        ) : (
          <Button fullWidth variant="contained" color="error" size="large" startIcon={<Stop />} onClick={gps.stop}>
            {t('personal.stop')}
          </Button>
        )}
        <Button variant="outlined" size="large" startIcon={<Refresh />} onClick={gps.reset} disabled={gps.running}>
          {t('personal.reset')}
        </Button>
      </Box>

      {/* 自分のベスト */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="caption" color="text.secondary">{t('personal.myBest')}</Typography>
        <Typography variant="h5" color="primary" sx={{ fontFamily: 'monospace' }}>
          {personal.best ? personal.best.lapTimeStr : '--:--.---'}
        </Typography>
      </Paper>

      {/* 履歴 */}
      <Typography variant="subtitle1" sx={{ mb: 1 }}>{t('personal.history')}</Typography>
      <Paper variant="outlined">
        {personal.laps.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">{t('personal.noHistory')}</Typography>
          </Box>
        ) : (
          <List dense>
            {personal.laps.map((l) => (
              <ListItem key={l.id} secondaryAction={
                l.lapTimeMs === personal.best?.lapTimeMs ? <Chip label="BEST" color="primary" size="small" /> : null
              }>
                <ListItemText
                  primary={l.lapTimeStr}
                  secondary={`${new Date(l.recordedAt).toLocaleString()}${l.course?.name ? ' · ' + l.course.name : ''}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {!user && <Alert severity="info" sx={{ mt: 2 }}>{t('personal.loginRequired')}</Alert>}
    </Container>
  );
}
