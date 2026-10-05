// 個別ラップタイムパネル（新規）
//
// liveStore の selectedCarKey（zekken正準・欠損時driverName）に一致する車のラップ履歴を表示。
// サーバー改修を避け、既存 getEventLapsFeed(eventId) を5秒ポーリングし、クライアント側で
// 選択車のラップだけ抽出する（イベント単位のラップ件数は数百規模で性能問題なし）。
// ベスト/ラスト/平均の小サマリを上部に表示。選択はベスト強調。

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Table, TableHead, TableBody, TableRow, TableCell, Typography, CircularProgress, Chip, Stack,
} from '@mui/material';
import { getEventLapsFeed } from '../../api/laps';
import type { Lap } from '../../types';
import { useLiveStore, carMatches } from '../../stores/liveStore';

// ラップが選択車に一致するか（zekken・driverName・participantName のいずれか一致で連動）
function matchesCar(lap: Lap, carKey: string): boolean {
  if (carMatches(carKey, { zekken: lap.zekken, driverName: lap.driverName })) return true;
  return lap.participantName === carKey;
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msPart = Math.floor(ms % 1000);
  return `${m}:${s.toString().padStart(2, '0')}.${msPart.toString().padStart(3, '0')}`;
}

export default function LapTimePanel({ eventId }: { eventId: string }) {
  const [allLaps, setAllLaps] = useState<Lap[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedCarKey = useLiveStore((s) => s.selectedCarKey);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const fetchLaps = async (isBackground: boolean) => {
      if (!isBackground) setLoading(true);
      try {
        const data = await getEventLapsFeed(eventId, 300);
        if (!mountedRef.current) return;
        setAllLaps(data);
      } catch {
        /* パネルなのでエラーは握りつぶして空表示に */
      } finally {
        if (mountedRef.current && !isBackground) setLoading(false);
      }
    };
    fetchLaps(false);
    const timer = setInterval(() => fetchLaps(true), 5000);
    return () => { mountedRef.current = false; clearInterval(timer); };
  }, [eventId]);

  // 選択車のラップを lapNumber 昇順で
  const laps = useMemo(() => {
    if (!selectedCarKey) return [];
    return allLaps
      .filter((l) => matchesCar(l, selectedCarKey))
      .sort((a, b) => a.lapNumber - b.lapNumber);
  }, [allLaps, selectedCarKey]);

  const summary = useMemo(() => {
    if (laps.length === 0) return null;
    const times = laps.map((l) => l.lapTimeMs).filter((t) => t > 0);
    if (times.length === 0) return null;
    const best = Math.min(...times);
    const last = laps[laps.length - 1].lapTimeMs;
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return { best, last, avg };
  }, [laps]);

  if (!selectedCarKey) {
    return <Typography variant="body2" color="text.secondary">映像・地図・順位表から車を選んでください</Typography>;
  }
  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>;
  }
  if (laps.length === 0) {
    return <Typography variant="body2" color="text.secondary">この車のラップ記録はまだありません</Typography>;
  }

  const bestMs = summary?.best;

  return (
    <Box>
      {summary && (
        <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', gap: 0.5 }}>
          <Chip size="small" color="primary" label={`BEST ${formatMs(summary.best)}`} />
          <Chip size="small" variant="outlined" label={`LAST ${formatMs(summary.last)}`} />
          <Chip size="small" variant="outlined" label={`AVG ${formatMs(summary.avg)}`} />
        </Stack>
      )}
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 44 }}>LAP</TableCell>
            <TableCell align="right">タイム</TableCell>
            <TableCell>セッション</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {laps.map((l) => {
            const isBest = bestMs != null && l.lapTimeMs === bestMs;
            return (
              <TableRow key={l.id} selected={isBest}>
                <TableCell>{l.lapNumber}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: isBest ? 'bold' : 'normal', color: isBest ? 'primary.main' : 'inherit' }}>
                  {l.lapTimeStr || formatMs(l.lapTimeMs)}
                </TableCell>
                <TableCell><Typography variant="caption" color="text.secondary">{l.sessionName || '-'}</Typography></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
}
