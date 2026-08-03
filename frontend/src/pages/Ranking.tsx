// ランキング表示画面

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  ArrowBack,
  EmojiEvents,
  Download,
} from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { getEventRanking, getCircuitRanking, getDateRanking, getOverallRanking } from '../api/ranking';
import { exportEventLapsCsv } from '../api/laps';
import type { RankingEntry } from '../types';

type RankingTab = 'event' | 'circuit' | 'date' | 'overall';

export default function Ranking() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { event, isAuthenticated, isOrganizer } = useAuthStore();

  const [currentTab, setCurrentTab] = useState<RankingTab>('event');
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // CSVエクスポート（運営者のみ、イベントが特定できる場合のみ）
  const handleExport = async () => {
    if (!event) return;
    setExporting(true);
    setError(null);
    try {
      await exportEventLapsCsv(event.id);
    } catch (err) {
      console.error('Failed to export CSV:', err);
      setError(err instanceof Error ? err.message : t('ranking.csvExportFailed'));
    } finally {
      setExporting(false);
    }
  };

  // ランキングデータ取得
  // isBackground=true の場合はローディング表示を出さず、裏で静かに更新する（ポーリング用）
  const fetchRanking = async (tab: RankingTab, isBackground = false) => {
    if (!isBackground) {
      setLoading(true);
      setError(null);
    }

    try {
      let data: RankingEntry[] = [];

      switch (tab) {
        case 'event':
          if (!event) throw new Error(t('ranking.noEventInfo'));
          data = await getEventRanking(event.id);
          break;
        case 'circuit':
          if (!event) throw new Error(t('ranking.noEventInfo'));
          data = await getCircuitRanking(event.circuitId);
          break;
        case 'date':
          const today = new Date().toISOString().split('T')[0];
          data = await getDateRanking(today);
          break;
        case 'overall':
          data = await getOverallRanking();
          break;
      }

      setRanking(data);
      // バックグラウンド更新が成功したら、前回のエラー表示は消しておく
      if (isBackground) setError(null);
    } catch (err) {
      console.error('Failed to fetch ranking:', err);
      // バックグラウンド更新の失敗は画面を壊さない（次の周期でリトライされる）
      if (!isBackground) {
        setError(t('ranking.fetchFailed'));
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  // タブ変更時にデータ取得＋5秒ごとの自動更新（ポーリング）
  useEffect(() => {
    // 初回はローディングを見せて取得
    fetchRanking(currentTab);

    // 以降は5秒ごとに裏で静かに再取得（主催者は画面を開いておくだけで最新に）
    const intervalId = setInterval(() => {
      fetchRanking(currentTab, true);
    }, 5000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: RankingTab) => {
    setCurrentTab(newValue);
  };

  const getRankMedal = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return t('ranking.rankSuffix', { rank });
  };

  return (
    <Container maxWidth="md" sx={{ mt: 2, pb: 4 }}>
      {/* ヘッダー */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate(-1)}
          sx={{ mr: 2 }}
        >
          {t('ranking.back')}
        </Button>
        <EmojiEvents sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="h5" component="h1">
          {t('ranking.title')}
        </Typography>
        <Box
          sx={{
            ml: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            color: 'text.secondary',
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: 'success.main',
              animation: 'pulse 1.5s ease-in-out infinite',
              '@keyframes pulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.3 },
              },
            }}
          />
          <Typography variant="caption">{t('ranking.autoUpdating')}</Typography>
        </Box>
      </Box>

      {/* CSVエクスポート（運営者のみ・イベント特定時） */}
      {isOrganizer() && event && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={exporting ? <CircularProgress size={16} /> : <Download />}
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? t('ranking.exporting') : t('ranking.csvDownload')}
          </Button>
        </Box>
      )}

      {/* タブ */}
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label={t('ranking.tabEvent')} value="event" />
          <Tab label={t('ranking.tabCircuit')} value="circuit" />
          <Tab label={t('ranking.tabDate')} value="date" />
          <Tab label={t('ranking.tabOverall')} value="overall" />
        </Tabs>
      </Paper>

      {/* イベント情報 */}
      {event && currentTab === 'event' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {event.name} - {event.circuit?.name ?? event.course?.name ?? ''}
        </Alert>
      )}

      {/* ローディング */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* エラー */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* ランキングテーブル */}
      {!loading && !error && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width="80px">{t('ranking.rank')}</TableCell>
                <TableCell>{t('ranking.driver')}</TableCell>
                <TableCell>{t('ranking.vehicle')}</TableCell>
                <TableCell align="right">{t('ranking.lapTime')}</TableCell>
                <TableCell width="120px">{t('ranking.recordedAt')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ranking.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                      {t('ranking.noRecords')}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                ranking.map((entry, index) => (
                  <TableRow
                    key={`${entry.driverName}-${entry.rank}`}
                    sx={{
                      backgroundColor: index < 3 ? 'action.hover' : 'inherit',
                      '&:hover': { backgroundColor: 'action.selected' }
                    }}
                  >
                    <TableCell>
                      <Typography
                        variant="h6"
                        sx={{
                          fontWeight: index < 3 ? 'bold' : 'normal',
                          fontSize: index < 3 ? '1.5rem' : '1.25rem'
                        }}
                      >
                        {getRankMedal(entry.rank)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                        {entry.driverName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {entry.vehicle || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="h6"
                        sx={{
                          fontFamily: 'monospace',
                          fontWeight: index < 3 ? 'bold' : 'normal',
                          color: index === 0 ? 'primary.main' : 'inherit'
                        }}
                      >
                        {entry.bestTime}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(entry.recordedAt).toLocaleDateString('ja-JP', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* 計測画面へ戻るボタン */}
      {isAuthenticated() && (
        <Button
          fullWidth
          variant="contained"
          size="large"
          sx={{ mt: 3 }}
          onClick={() => navigate('/measurement')}
        >
          {t('ranking.backToMeasurement')}
        </Button>
      )}
    </Container>
  );
}
