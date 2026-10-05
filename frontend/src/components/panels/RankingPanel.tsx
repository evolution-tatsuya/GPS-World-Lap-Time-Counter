// 順位表パネル（イベントランキング）
//
// 既存 getEventRanking を5秒ポーリング。行クリックで選択車(selectCar)を更新し、
// 個別ラップパネル等と連動する。ポーリングはバックグラウンド更新なので、
// 更新時に全ローディング表示へ戻さない（ちらつき防止）。

import { useEffect, useState, useRef } from 'react';
import {
  Box, Table, TableHead, TableBody, TableRow, TableCell, Typography, CircularProgress,
} from '@mui/material';
import { getEventRanking } from '../../api/ranking';
import type { RankingEntry } from '../../types';
import { useLiveStore, carMatches } from '../../stores/liveStore';

export default function RankingPanel({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selectedCarKey = useLiveStore((s) => s.selectedCarKey);
  const selectCar = useLiveStore((s) => s.selectCar);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const fetchRanking = async (isBackground: boolean) => {
      if (!isBackground) setLoading(true);
      try {
        const data = await getEventRanking(eventId);
        if (!mountedRef.current) return;
        setRows(data);
        setError('');
      } catch (e) {
        if (!mountedRef.current) return;
        setError(e instanceof Error ? e.message : '順位の取得に失敗しました');
      } finally {
        if (mountedRef.current && !isBackground) setLoading(false);
      }
    };
    fetchRanking(false);
    const timer = setInterval(() => fetchRanking(true), 5000);
    return () => { mountedRef.current = false; clearInterval(timer); };
  }, [eventId]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>;
  }
  if (error) {
    return <Typography variant="body2" color="error">{error}</Typography>;
  }
  if (rows.length === 0) {
    return <Typography variant="body2" color="text.secondary">まだ記録がありません</Typography>;
  }

  return (
    <Table size="small" stickyHeader>
      <TableHead>
        <TableRow>
          <TableCell sx={{ width: 36 }}>#</TableCell>
          <TableCell>ドライバー</TableCell>
          <TableCell align="right">ベスト</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r) => {
          // ランキングAPIはzekkenを返さないためdriverNameを選択キーにする。
          // 一致判定はcarMatchesで両対応（映像/地図でzekken選択済みでも、driverNameが一致すれば連動）。
          const key = r.driverName;
          const selected = carMatches(selectedCarKey, { driverName: r.driverName });
          return (
            <TableRow
              key={`${r.rank}-${r.driverName}`}
              hover
              selected={selected}
              onClick={() => selectCar(key)}
              sx={{ cursor: 'pointer' }}
            >
              <TableCell>{r.rank}</TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: selected ? 'bold' : 'normal' }}>{r.driverName}</Typography>
                {r.vehicle && <Typography variant="caption" color="text.secondary">{r.vehicle}</Typography>}
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.bestTime}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
