// 車載映像 配信コンポーネント（ドライバー側）
//
// 「配信開始」を押すと背面カメラを取得しP2Pで運営へ配信する。
// 握手(SDP/ICE)は既存バックエンドのシグナリングAPI経由。映像本体はP2P直送。
// 主催者に車載カメラ機能が許可されている(cameraEnabled)ときだけ使う想定。

import { useRef, useState, useEffect } from 'react';
import { Box, Button, Typography, Alert } from '@mui/material';
import { Videocam, VideocamOff } from '@mui/icons-material';
import { postOffer, postPubIce, pollPub, RTC_CONFIG } from '../api/signaling';

const POLL_MS = 1500;

export default function CarCameraPublisher() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pollRef = useRef<number | null>(null);
  const answeredRef = useRef(false);
  const addedCandRef = useRef(0);

  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const stop = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    answeredRef.current = false;
    addedCandRef.current = 0;
    setPublishing(false);
    setStatus('');
  };

  // アンマウント時に確実に停止
  useEffect(() => () => stop(), []);

  const start = async () => {
    setError('');
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      setError('カメラはhttps接続でのみ利用できます'); return;
    }
    try {
      setStatus('カメラ起動中…');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // 自分のICE候補が出たらサーバーへ送る
      pc.onicecandidate = (e) => {
        if (e.candidate) postPubIce(e.candidate.toJSON()).catch(() => {});
      };
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === 'connected') setStatus('配信中（運営が接続しました）');
        else if (s === 'connecting') setStatus('運営の接続を待っています…');
        else if (s === 'failed' || s === 'disconnected') setStatus('接続が切れました。再接続を待っています…');
      };

      // offer作成→サーバーへ登録
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await postOffer(offer);
      setPublishing(true);
      setStatus('配信を開始しました。運営の接続を待っています…');

      // viewerのanswer/ICEをポーリングで取り込む
      pollRef.current = window.setInterval(async () => {
        try {
          const { answer, candidates } = await pollPub();
          if (answer && !answeredRef.current && pc.signalingState !== 'stable') {
            answeredRef.current = true;
            await pc.setRemoteDescription(JSON.parse(answer));
          }
          // 新規のviewer ICE候補を追加
          for (let i = addedCandRef.current; i < candidates.length; i++) {
            try { await pc.addIceCandidate(JSON.parse(candidates[i])); } catch { /* noop */ }
          }
          addedCandRef.current = candidates.length;
        } catch { /* ポーリング失敗は握りつぶす */ }
      }, POLL_MS);
    } catch (e) {
      setError('カメラを起動できませんでした: ' + (e instanceof Error ? e.message : String(e)));
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
