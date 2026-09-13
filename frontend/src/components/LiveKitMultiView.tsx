// 車載映像 マルチビュー（運営側・LiveKit版）
//
// viewerとしてRoomに接続し、配信中の全車を購読する。
// レイアウト: メイン(選択中を大きく) ＋ サムネイル一覧(複数・多い場合は横スクロール)。
// サムネタップでメイン切替。各映像に「No.ゼッケン 名前」を重ねる。

import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import {
  Room, RoomEvent, RemoteTrack, RemoteTrackPublication, RemoteParticipant, Participant, Track,
} from 'livekit-client';
import { getViewToken } from '../api/livekit';

interface Feed {
  identity: string;
  label: string;      // 「No.7 名前」など
  track: RemoteTrack | null;
}

// participant.metadata(JSON) から表示ラベルを作る
function labelFromParticipant(p: RemoteParticipant): string {
  let name = p.name || p.identity;
  let zekken: string | null = null;
  try {
    if (p.metadata) {
      const m = JSON.parse(p.metadata);
      if (m.participantName) name = m.participantName;
      if (m.zekken) zekken = String(m.zekken);
    }
  } catch { /* noop */ }
  return zekken ? `No.${zekken} ${name}` : name;
}

export default function LiveKitMultiView({ eventId }: { eventId: string }) {
  const roomRef = useRef<Room | null>(null);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [mainId, setMainId] = useState<string | null>(null);
  const [status, setStatus] = useState('接続中…');

  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const thumbRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  // feeds を更新するヘルパ（identityごとに1件）
  const upsertFeed = useCallback((identity: string, label: string, track: RemoteTrack | null) => {
    setFeeds((prev) => {
      const idx = prev.findIndex((f) => f.identity === identity);
      if (idx === -1) return [...prev, { identity, label, track }];
      const next = prev.slice();
      next[idx] = { ...next[idx], label, track: track ?? next[idx].track };
      return next;
    });
  }, []);

  const removeFeed = useCallback((identity: string) => {
    setFeeds((prev) => prev.filter((f) => f.identity !== identity));
    thumbRefs.current.delete(identity);
    setMainId((cur) => (cur === identity ? null : cur));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const room = new Room({ adaptiveStream: true });
    roomRef.current = room;

    const onTrackSubscribed = (
      track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant,
    ) => {
      if (track.kind === Track.Kind.Video) {
        upsertFeed(participant.identity, labelFromParticipant(participant), track);
      }
    };
    const onTrackUnsubscribed = (
      _track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant,
    ) => {
      upsertFeed(participant.identity, labelFromParticipant(participant), null);
    };
    const onParticipantDisconnected = (participant: RemoteParticipant) => {
      removeFeed(participant.identity);
    };
    const onMetaChanged = (_m: string | undefined, participant?: Participant) => {
      if (participant && participant instanceof RemoteParticipant) {
        upsertFeed(participant.identity, labelFromParticipant(participant), null);
      }
    };

    room
      .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
      .on(RoomEvent.ParticipantMetadataChanged, onMetaChanged)
      .on(RoomEvent.Disconnected, () => { if (!cancelled) setStatus('切断されました'); });

    (async () => {
      try {
        const { url, token } = await getViewToken(eventId);
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) return;
        setStatus('');
        // 既に配信中の参加者を拾う
        room.remoteParticipants.forEach((p) => {
          upsertFeed(p.identity, labelFromParticipant(p), null);
          p.trackPublications.forEach((pub) => {
            if (pub.track && pub.kind === Track.Kind.Video) {
              upsertFeed(p.identity, labelFromParticipant(p), pub.track);
            }
          });
        });
      } catch (e) {
        if (!cancelled) setStatus('映像に接続できませんでした' + (e instanceof Error ? `: ${e.message}` : ''));
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
    };
  }, [eventId, upsertFeed, removeFeed]);

  // メイン未選択なら最初のfeedを自動選択
  useEffect(() => {
    if (!mainId && feeds.length > 0) setMainId(feeds[0].identity);
  }, [feeds, mainId]);

  // メイン映像のattach
  useEffect(() => {
    const main = feeds.find((f) => f.identity === mainId);
    const el = mainVideoRef.current;
    if (el && main?.track) main.track.attach(el);
    return () => { if (main?.track && el) main.track.detach(el); };
  }, [mainId, feeds]);

  // サムネイルのattach
  useEffect(() => {
    feeds.forEach((f) => {
      const el = thumbRefs.current.get(f.identity);
      if (el && f.track) f.track.attach(el);
    });
  }, [feeds]);

  const mainFeed = feeds.find((f) => f.identity === mainId) || null;

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: { xs: '32vh', md: '65vh' }, bgcolor: '#000' }}>
      {/* メイン */}
      <Box sx={{ position: 'relative', flex: 1, minHeight: 0, bgcolor: '#000' }}>
        {mainFeed?.track ? (
          <video ref={mainVideoRef} autoPlay muted playsInline
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        ) : (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
            <Typography variant="body2" sx={{ color: 'grey.400', textAlign: 'center' }}>
              {status || (feeds.length === 0 ? 'まだ配信している車がいません' : '映像を待っています…')}
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
        <Box sx={{ display: 'flex', gap: 0.5, p: 0.5, overflowX: 'auto', bgcolor: '#111' }}>
          {feeds.map((f) => (
            <Box
              key={f.identity}
              onClick={() => setMainId(f.identity)}
              sx={{
                position: 'relative', flex: '0 0 auto', width: 120, aspectRatio: '16 / 9',
                bgcolor: '#000', borderRadius: 1, overflow: 'hidden', cursor: 'pointer',
                outline: f.identity === mainId ? '2px solid #3AA0FF' : '1px solid #333',
              }}
            >
              <video
                ref={(el) => { if (el) thumbRefs.current.set(f.identity, el); else thumbRefs.current.delete(f.identity); }}
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
