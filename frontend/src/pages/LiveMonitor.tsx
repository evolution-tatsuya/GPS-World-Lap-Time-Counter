// 運営ライブモニター（ポーリング・通過モニター）
// イベントの最新ラップを新しい順で表示。5秒ごとに再取得し、新着ラップにNEWバッジ。
// トランスポンダーの通過モニターのイメージ。SSE不要でシンプル・接続切れに強い。

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container, Box, Typography, Button, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Alert,
} from '@mui/material';
import { ArrowBack, MonitorHeart } from '@mui/icons-material';
import { getEventLapsFeed } from '../api/laps';
import type { Lap } from '../types';

const POLL_MS = 5000;

export default function LiveMonitor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [laps, setLaps] = useState<Lap[]>([]);
  const [error, setError] = useState('');
  const seenIds = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    let alive = true;

    const poll = async () => {
      try {
        const data = await getEventLapsFeed(id, 50);
        if (!alive) return;
        // 前回未見のラップを「NEW」としてマーク
        const fresh = new Set<string>();
        for (const l of data) {
          if (!seenIds.current.has(l.id)) fresh.add(l.id);
        }
        data.forEach((l) => seenIds.current.add(l.id));
        setLaps(data);
        if (fresh.size) {
          setNewIds(fresh);
          // 数秒後にNEW表示を消す
          setTimeout(() => { if (alive) setNewIds(new Set()); }, 4000);
        }
        setError('');
      } catch {
        if (alive) setError(t('monitor.loadFailed'));
      }
    };

    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <Container maxWidth="md" sx={{ mt: 2, pb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate(id ? `/events/${id}` : '/dashboard')} sx={{ mr: 1 }}>
          {t('monitor.backToEvent')}
        </Button>
        <MonitorHeart sx={{ mr: 1, color: 'error.main' }} />
        <Typography variant="h5" component="h1">{t('monitor.title')}</Typography>
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
          <Box sx={{
            width: 8, height: 8, borderRadius: '50%', backgroundColor: 'success.main',
            animation: 'pulse 1.5s ease-in-out infinite',
            '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
          }} />
          <Typography variant="caption">{t('monitor.autoUpdating')}</Typography>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('monitor.subtitle')}
      </Typography>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('monitor.zekken')}</TableCell>
              <TableCell>{t('monitor.driver')}</TableCell>
              <TableCell>{t('monitor.vehicle')}</TableCell>
              <TableCell align="center">{t('monitor.lap')}</TableCell>
              <TableCell align="right">{t('monitor.time')}</TableCell>
              <TableCell align="right">{t('monitor.recorded')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {laps.length === 0 && (
              <TableRow><TableCell colSpan={6}>{t('monitor.noLaps')}</TableCell></TableRow>
            )}
            {laps.map((l) => {
              const isNew = newIds.has(l.id);
              return (
                <TableRow
                  key={l.id}
                  sx={isNew ? { backgroundColor: 'action.selected' } : undefined}
                >
                  <TableCell>{l.zekken || '—'}</TableCell>
                  <TableCell>
                    {l.participantName}
                    {isNew && <Chip label={t('monitor.new')} color="error" size="small" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>{l.vehicleOrGear || l.vehicle || '—'}</TableCell>
                  <TableCell align="center">{l.lapNumber}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                    {l.lapTimeStr}
                  </TableCell>
                  <TableCell align="right">{new Date(l.recordedAt).toLocaleTimeString()}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}
