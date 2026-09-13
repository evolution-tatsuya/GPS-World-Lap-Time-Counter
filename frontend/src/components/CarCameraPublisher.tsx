// 車載映像 配信コンポーネント（ドライバー側・LiveKit版）
//
// 「配信開始」で背面カメラをLiveKit(SFU)へ配信する。多台数でも安定。
// 主催者に車載カメラ機能が許可されている(cameraEnabled)ときだけ表示される想定。

import { useRef, useState, useEffect } from 'react';
import { Box, Button, Typography, Alert } from '@mui/material';
import { Videocam, VideocamOff } from '@mui/icons-material';
import { Room, RoomEvent, createLocalVideoTrack } from 'livekit-client';
import { getPublishToken } from '../api/livekit';

export default function CarCameraPublisher() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const stop = () => {
    if (roomRef.current) { roomRef.current.disconnect(); roomRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setPublishing(false);
    setStatus('');
  };

  useEffect(() => () => stop(), []);

  const start = async () => {
    setError('');
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      setError('カメラはhttps接続でのみ利用できます'); return;
    }
    try {
      setStatus('接続の準備中…');
      const { url, token } = await getPublishToken();

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.Disconnected, () => { setPublishing(false); setStatus('切断されました'); });
      room.on(RoomEvent.Reconnecting, () => setStatus('再接続中…'));
      room.on(RoomEvent.Reconnected, () => setStatus('配信中'));

      await room.connect(url, token);
      setStatus('カメラ起動中…');

      // 背面カメラを配信
      const videoTrack = await createLocalVideoTrack({
        facingMode: 'environment',
        resolution: { width: 1280, height: 720 },
      });
      await room.localParticipant.publishTrack(videoTrack);

      // 自分のプレビュー表示
      if (videoRef.current) {
        videoTrack.attach(videoRef.current);
      }

      setPublishing(true);
      setStatus('配信中（運営が見られる状態です）');
    } catch (e) {
      setError('配信を開始できませんでした: ' + (e instanceof Error ? e.message : String(e)));
      stop();
    }
  };

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Videocam fontSize="small" color="primary" />
        <Typography variant="subtitle2">車載映像の配信</Typography>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: '100%', borderRadius: 6, background: '#000',
          aspectRatio: '16 / 9', objectFit: 'cover',
          display: publishing ? 'block' : 'none', marginBottom: 8,
        }}
      />
      <Button
        fullWidth
        variant={publishing ? 'outlined' : 'contained'}
        color={publishing ? 'inherit' : 'primary'}
        startIcon={publishing ? <VideocamOff /> : <Videocam />}
        onClick={publishing ? stop : start}
      >
        {publishing ? '配信を停止' : '車載映像を配信'}
      </Button>
      {status && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {status}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        ※ 通信量・電池を多く使います。車載給電を推奨。画面はつけたままにしてください。
      </Typography>
    </Box>
  );
}
