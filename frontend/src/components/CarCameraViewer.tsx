// 車載映像 受信コンポーネント（運営側）
//
// 選択中の参加者(participantName)の配信をP2Pで受信し表示する。
// 配信者一覧から該当keyを探し、offerを取得→answerを返し→ICE交換→ontrackで表示。
// 配信していない車を選んだ場合は「配信していません」を表示する。

import { useRef, useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import {
  listPublishers, getOffer, postAnswer, RTC_CONFIG,
} from '../api/signaling';

const POLL_MS = 1500;

export default function CarCameraViewer({
  eventId,
  participantName,
  label,
}: {
  eventId: string;
  participantName: string | null;
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pollRef = useRef<number | null>(null);
  const addedCandRef = useRef(0);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;

    const cleanup = () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
      if (videoRef.current) videoRef.current.srcObject = null;
      addedCandRef.current = 0;
    };

    const connect = async () => {
      cleanup();
      if (!participantName) { setStatus(''); return; }
      setStatus('配信を探しています…');
      try {
        // 配信一覧から、この参加者名のkeyを探す
        const { publishers } = await listPublishers(eventId);
        const pub = publishers.find((p) => p.participantName === participantName);
        if (!pub) { if (!cancelled) setStatus('この車は現在、映像を配信していません'); return; }

        const { offer, candidates } = await getOffer(eventId, pub.key);
        if (!offer) { if (!cancelled) setStatus('配信の準備中です…'); return; }
        if (cancelled) return;

        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        // 受信専用（送るトラックはない）
        pc.addTransceiver('video', { direction: 'recvonly' });

        pc.ontrack = (e) => {
          if (videoRef.current && e.streams[0]) {
            videoRef.current.srcObject = e.streams[0];
            videoRef.current.play().catch(() => {});
          }
        };
        pc.onicecandidate = (ev) => {
          if (ev.candidate) postAnswer(eventId, pub.key, { candidate: ev.candidate.toJSON() }).catch(() => {});
        };
        pc.onconnectionstatechange = () => {
          const s = pc.connectionState;
          if (s === 'connected') setStatus('');
          else if (s === 'connecting') setStatus('接続中…');
          else if (s === 'failed' || s === 'disconnected') setStatus('接続が切れました');
        };

        await pc.setRemoteDescription(JSON.parse(offer));
        // 配信者の既存ICE候補を追加
        for (const c of candidates) { try { await pc.addIceCandidate(JSON.parse(c)); } catch { /* noop */ } }
        addedCandRef.current = candidates.length;

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await postAnswer(eventId, pub.key, { answer });
        setStatus('接続中…');

        // 配信者の追加ICE候補をポーリングで取り込む
        pollRef.current = window.setInterval(async () => {
          try {
            const { candidates: more } = await getOffer(eventId, pub.key);
            for (let i = addedCandRef.current; i < more.length; i++) {
              try { await pc.addIceCandidate(JSON.parse(more[i])); } catch { /* noop */ }
            }
            addedCandRef.current = more.length;
          } catch { /* noop */ }
        }, POLL_MS);
      } catch {
        if (!cancelled) setStatus('映像の取得に失敗しました');
      }
    };

    connect();
    return () => { cancelled = true; cleanup(); };
  }, [eventId, participantName]);

  return (
    <Box sx={{ position: 'relative', flex: 1, minHeight: { xs: '32vh', md: '65vh' }, bgcolor: '#000' }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
      />
      {label && (
        <Box sx={{ position: 'absolute', left: 10, top: 10, bgcolor: 'rgba(0,0,0,.6)', px: 1.2, py: 0.5, borderRadius: 1 }}>
          <Typography variant="body2" sx={{ color: '#fff', fontWeight: 'bold' }}>{label}</Typography>
        </Box>
      )}
      {status && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
          <Typography variant="body2" sx={{ color: 'grey.400', textAlign: 'center' }}>{status}</Typography>
        </Box>
      )}
    </Box>
  );
}
