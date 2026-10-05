// ライブダッシュボード（器）
//
// 1画面にパネルを並置し、パネルのON/OFFで出し入れする。ページ遷移をしないので、
// パネル切替でライブ映像接続・選択車・順位はリセットされない（liveStoreが保持）。
//
// 2つの入口（mode）:
//  - gallery: 観客。eventCodeで公開視聴トークンを取得（ログイン不要）。
//  - driver : ドライバー。参加セッションのeventCodeで公開視聴トークンを使う。配信は別画面で継続。
// どちらのモードもコースマップは形状のみ（走行位置は運営専用APIのため。Phase 5で公開API対応予定）。

import { useEffect, useMemo } from 'react';
import {
  Box, Container, ToggleButton, ToggleButtonGroup, Typography, Button, Chip,
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useLiveStore } from '../stores/liveStore';
import type { PanelKey, DashboardMode } from '../types';
import PanelFrame from '../components/panels/PanelFrame';
import MultiViewPanel from '../components/panels/MultiViewPanel';
import RankingPanel from '../components/panels/RankingPanel';
import LapTimePanel from '../components/panels/LapTimePanel';
import CourseMapPanel from '../components/panels/CourseMapPanel';

const PANEL_LABELS: Record<PanelKey, string> = {
  multiview: '車載映像',
  ranking: '順位表',
  laptime: '個別ラップ',
  coursemap: 'コースマップ',
};

interface LiveDashboardProps {
  eventId: string;
  eventCode?: string;   // gallery入口のときに指定（公開トークン用）
  mode: DashboardMode;
  eventName?: string;
  backTo?: string;      // 戻る先（未指定なら戻るボタン非表示）
}

export default function LiveDashboard({ eventId, eventCode, mode, eventName, backTo }: LiveDashboardProps) {
  const navigate = useNavigate();
  const panels = useLiveStore((s) => s.panels);
  const togglePanel = useLiveStore((s) => s.togglePanel);
  const setPanel = useLiveStore((s) => s.setPanel);
  const connectViewer = useLiveStore((s) => s.connectViewer);
  const disconnectViewer = useLiveStore((s) => s.disconnectViewer);
  const status = useLiveStore((s) => s.status);

  // ダッシュボード表示中のみ接続。離脱時に切断。パネルのON/OFFでは切れない。
  useEffect(() => {
    connectViewer({ eventId, eventCode, mode });
    return () => { disconnectViewer(); };
  }, [eventId, eventCode, mode, connectViewer, disconnectViewer]);

  const activePanels = useMemo(
    () => (Object.keys(panels) as PanelKey[]).filter((k) => panels[k]),
    [panels],
  );

  const renderPanel = (key: PanelKey) => {
    switch (key) {
      case 'multiview':
        return <PanelFrame title={PANEL_LABELS.multiview} flush onClose={() => setPanel('multiview', false)}><MultiViewPanel /></PanelFrame>;
      case 'ranking':
        return <PanelFrame title={PANEL_LABELS.ranking} onClose={() => setPanel('ranking', false)}><RankingPanel eventId={eventId} /></PanelFrame>;
      case 'laptime':
        return <PanelFrame title={PANEL_LABELS.laptime} onClose={() => setPanel('laptime', false)}><LapTimePanel eventId={eventId} /></PanelFrame>;
      case 'coursemap':
        // 位置ポーリング(getEventPositions)は運営専用APIのため、ダッシュボード(gallery/driver)では
        // 常に形状のみ表示。走行位置の公開はPhase5(公開positions API)で対応予定。
        return <PanelFrame title={PANEL_LABELS.coursemap} flush onClose={() => setPanel('coursemap', false)}><CourseMapPanel eventId={eventId} showPositions={false} /></PanelFrame>;
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      {/* ヘッダ */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        {backTo && (
          <Button startIcon={<ArrowBack />} onClick={() => navigate(backTo)} size="small">戻る</Button>
        )}
        <Typography variant="h6" component="h1" sx={{ fontWeight: 'bold' }}>
          {eventName || 'ライブダッシュボード'}
        </Typography>
        <Chip
          size="small"
          label={status === 'connected' ? '接続中' : status === 'connecting' ? '接続待ち' : status === 'error' ? '映像エラー' : '待機'}
          color={status === 'connected' ? 'success' : status === 'error' ? 'error' : 'default'}
        />
        {mode === 'gallery' && <Chip size="small" variant="outlined" label="観戦ビュー" />}
      </Box>

      {/* パネルON/OFFトグルバー */}
      <ToggleButtonGroup size="small" sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        {(Object.keys(PANEL_LABELS) as PanelKey[]).map((key) => (
          <ToggleButton key={key} value={key} selected={panels[key]} onChange={() => togglePanel(key)}>
            {PANEL_LABELS[key]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* パネルグリッド（2x2 / タブレット2列 / モバイル1列） */}
      {activePanels.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          上のボタンで表示するパネルを選んでください
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: activePanels.length === 1 ? '1fr' : '1fr 1fr' },
            gap: 1.5,
            // パネルの高さを揃える（画面高に応じて）
            gridAutoRows: { xs: '46vh', md: activePanels.length <= 2 ? '70vh' : '42vh' },
          }}
        >
          {activePanels.map((key) => (
            <Box key={key} sx={{ minHeight: 0 }}>{renderPanel(key)}</Box>
          ))}
        </Box>
      )}
    </Container>
  );
}
