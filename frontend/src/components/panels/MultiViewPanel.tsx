// 車載映像マルチビューパネル
//
// liveStore の feeds を購読して video に attach するだけの薄い表示。
// Room接続は liveStore が保持するため、このパネルを閉じて再度開いても映像は再接続されない。
// メイン大画面 ＋ サムネイル一覧。サムネ/メインのクリックで「選択車(selectCar)」も更新し、
// 他パネル（個別ラップ等）と連動する。

import { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { useLiveStore } from '../../stores/liveStore';

export default function MultiViewPanel() {
  const feeds = useLiveStore((s) => s.feeds);
  const mainIdentity = useLiveStore((s) => s.mainIdentity);
  const status = useLiveStore((s) => s.status);
  const statusMessage = useLiveStore((s) => s.statusMessage);
  const setMain = useLiveStore((s) => s.setMain);
  const selectCar = useLiveStore((s) => s.selectCar);

  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const thumbRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const mainFeed = feeds.find((f) => f.participantId === mainIdentity) || null;

  // メイン映像のattach
  // 依存は track と identity のみ（mainFeedオブジェクトは毎レンダ再生成されるため、
  // それを依存にすると他車の出入りのたびに detach→attach が走り映像がチラつく）
  const mainTrack = mainFeed?.track ?? null;
  const mainFeedId = mainFeed?.participantId ?? null;
  useEffect(() => {
    const el = mainVideoRef.current;
    if (el && mainTrack) mainTrack.attach(el);
    return () => { if (el && mainTrack) mainTrack.detach(el); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTrack, mainFeedId]);

  // サムネイルのattach
  useEffect(() => {
    feeds.forEach((f) => {
      const el = thumbRefs.current.get(f.participantId);
      if (el && f.track) f.track.attach(el);
    });
  }, [feeds]);

  // 映像を選んだとき、選択車(zekken正準・欠損時driverName)も更新して他パネルと連動
  const handleSelect = (participantId: string) => {
    setMain(participantId);
    const f = feeds.find((x) => x.participantId === participantId);
    selectCar(f?.zekken ?? f?.driverName ?? null);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: '#000' }}>
      {/* メイン */}
      <Box sx={{ position: 'relative', flex: 1, minHeight: 0, bgcolor: '#000' }}>
        {mainFeed?.track ? (
          <video
            ref={mainVideoRef} autoPlay muted playsInline
            onClick={() => mainFeed && handleSelect(mainFeed.participantId)}
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
          />
        ) : (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
            <Typography variant="body2" sx={{ color: 'grey.400', textAlign: 'center' }}>
              {statusMessage || (status === 'connecting' ? '接続中…' : feeds.length === 0 ? 'まだ配信している車がいません' : '映像を待っています…')}
            </Typography>
          </Box>
        )}
        {mainFeed && (
          <Box sx={{ position: 'absolute', left: 10, top: 10, bgcolor: 'rgba(0,0,0,.6)', px: 1.2, py: 0.5, borderRadius: 1 }}>
            <Typography variant="body2" sx={{ color: '#fff', fontWeight: 'bold' }}>{mainFeed.label}</Typography>
          </Box>
        )}
      </Box>

      {/* サムネイル一覧（横スクロール） */}
      {feeds.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, p: 0.5, overflowX: 'auto', bgcolor: '#111', flex: '0 0 auto' }}>
          {feeds.map((f) => (
            <Box
              key={f.participantId}
              onClick={() => handleSelect(f.participantId)}
              sx={{
                position: 'relative', flex: '0 0 auto', width: 120, aspectRatio: '16 / 9',
                bgcolor: '#000', borderRadius: 1, overflow: 'hidden', cursor: 'pointer',
                outline: f.participantId === mainIdentity ? '2px solid #3AA0FF' : '1px solid #333',
              }}
            >
              <video
                ref={(el) => { if (el) thumbRefs.current.set(f.participantId, el); else thumbRefs.current.delete(f.participantId); }}
                autoPlay muted playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
              />
              <Box sx={{ position: 'absolute', left: 2, bottom: 2, bgcolor: 'rgba(0,0,0,.6)', px: 0.6, borderRadius: 0.5 }}>
                <Typography variant="caption" sx={{ color: '#fff', fontSize: 10 }}>{f.label}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
