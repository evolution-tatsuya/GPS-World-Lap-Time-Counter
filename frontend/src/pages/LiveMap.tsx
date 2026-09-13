// 参加者位置ライブモニター（主催者専用）— 2ペイン観戦ビュー
//
// 左: 車載映像パネル（WebRTC配信の差し込み口。現状はプレースホルダ）。
// 右: 地図に参加者の現在地を表示。1秒ごとにポーリングし、マーカーは前回→今回位置を
//     補間して滑らかに移動。コース中心線があればコース上に吸着（周回/ラリー両対応）。
// 下: 車選択リスト。選ぶと左の映像枠に大写し（予定）＋マーカー強調。
// 開催時間外はサーバーが空を返すため「開催時間外」と表示される。

import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  Alert,
  CircularProgress,
  Chip,
  ToggleButton,
} from '@mui/material';
import { ArrowBack, MyLocation, Videocam } from '@mui/icons-material';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuthStore } from '../stores/authStore';
import { getEvent } from '../api/events';
import { getEventPositions, type LiveParticipant } from '../api/positions';
import CarCameraViewer from '../components/CarCameraViewer';
import type { EventWithCourse } from '../types';

const POLL_MS = 1000;

// 参加者の一意キー（表示・選択に使う）
function keyOf(p: LiveParticipant): string {
  return p.participantName;
}

// マーカーアイコン（選択中は青・少し大きく）
function participantIcon(label: string, selected: boolean): L.DivIcon {
  const safe = label.replace(/[<>&"]/g, '');
  const size = selected ? 38 : 34;
  const bg = selected ? '#3AA0FF' : '#E10600';
  return L.divIcon({
    className: 'participant-marker',
    html: `<div style="
      background:${bg};color:#fff;border:2px solid #fff;border-radius:50%;
      width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:bold;box-shadow:0 1px 4px rgba(0,0,0,.5);
      ">${safe}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ---- コース吸着（スナップ） ----
// 中心線 line（[lat,lng][]）があれば、点を最寄りのセグメント上に投影して返す。
// しきい値(SNAP_MAX_M)より遠い点（コースアウト/ピット等）は素の位置を返す。
const SNAP_MAX_M = 40;
function projectToSeg(
  p: { lat: number; lng: number },
  a: [number, number],
  b: [number, number],
): { lat: number; lng: number; d: number } {
  const mLat = 111320;
  const mLng = 111320 * Math.cos((a[0] * Math.PI) / 180);
  const bx = (b[1] - a[1]) * mLng;
  const by = (b[0] - a[0]) * mLat;
  const px = (p.lng - a[1]) * mLng;
  const py = (p.lat - a[0]) * mLat;
  const len2 = bx * bx + by * by;
  let t = len2 > 0 ? (px * bx + py * by) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = bx * t;
  const cy = by * t;
  const d = Math.hypot(px - cx, py - cy);
  return { lat: a[0] + cy / mLat, lng: a[1] + cx / mLng, d };
}
function snapToCourse(
  p: { lat: number; lng: number },
  line: [number, number][] | null,
): { lat: number; lng: number } {
  if (!line || line.length < 2) return p;
  let best: { lat: number; lng: number; d: number } | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const proj = projectToSeg(p, line[i], line[i + 1]);
    if (!best || proj.d < best.d) best = proj;
  }
  if (!best || best.d > SNAP_MAX_M) return p;
  return { lat: best.lat, lng: best.lng };
}

// 補間つきマーカー群。positions が更新されるたびに「現在の描画位置→新目標」へ
// requestAnimationFrame で滑らかに動かす。map への直接描画で軽量に。
function SmoothMarkers({
  positions,
  selectedKey,
  onSelect,
  courseLine,
}: {
  positions: LiveParticipant[];
  selectedKey: string | null;
  onSelect: (k: string) => void;
  courseLine: [number, number][] | null;
}) {
  const map = useMap();
  // key -> { marker, prev, target, prevT }
  const stateRef = useRef<
    Map<
      string,
      {
        marker: L.Marker;
        prev: { lat: number; lng: number };
        target: { lat: number; lng: number };
        prevT: number;
      }
    >
  >(new Map());
  const rafRef = useRef<number | null>(null);
  const fittedRef = useRef(false);

  // 目標位置の更新（ポーリング結果が来るたび）
  useEffect(() => {
    const now = performance.now();
    const store = stateRef.current;
    const seen = new Set<string>();

    positions.forEach((p) => {
      const k = keyOf(p);
      seen.add(k);
      const snapped = snapToCourse({ lat: p.lat, lng: p.lng }, courseLine);
      // マーカーはゼッケン番号を表示（無ければ名前の頭文字）
      const label = p.zekken || p.participantName.slice(0, 2);
      const existing = store.get(k);
      if (!existing) {
        const marker = L.marker([snapped.lat, snapped.lng], {
          icon: participantIcon(label, k === selectedKey),
        })
          .addTo(map)
          .on('click', () => onSelect(k));
        store.set(k, {
          marker,
          prev: snapped,
          target: snapped,
          prevT: now,
        });
      } else {
        const cur = existing.marker.getLatLng();
        existing.prev = { lat: cur.lat, lng: cur.lng };
        existing.target = snapped;
        existing.prevT = now;
        existing.marker.setIcon(participantIcon(label, k === selectedKey));
      }
    });

    // 消えた参加者のマーカーを除去
    store.forEach((v, k) => {
      if (!seen.has(k)) {
        map.removeLayer(v.marker);
        store.delete(k);
      }
    });

    // 初回のみ全体にフィット
    if (!fittedRef.current && positions.length > 0) {
      fittedRef.current = true;
      const bounds = L.latLngBounds(
        positions.map((p) => [p.lat, p.lng] as [number, number]),
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    }
  }, [positions, selectedKey, courseLine, map, onSelect]);

  // 補間ループ
  useEffect(() => {
    const step = () => {
      const now = performance.now();
      stateRef.current.forEach((v) => {
        const span = POLL_MS; // 到達までの想定時間
        const k = Math.min(1, (now - v.prevT) / span);
        const lat = v.prev.lat + (v.target.lat - v.prev.lat) * k;
        const lng = v.prev.lng + (v.target.lng - v.prev.lng) * k;
        v.marker.setLatLng([lat, lng]);
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // アンマウント時に全マーカー除去
  useEffect(() => {
    const store = stateRef.current;
    return () => {
      store.forEach((v) => map.removeLayer(v.marker));
      store.clear();
    };
  }, [map]);

  return null;
}

export default function LiveMap() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isOrganizer } = useAuthStore();

  const [event, setEvent] = useState<EventWithCourse | null>(null);
  const [positions, setPositions] = useState<LiveParticipant[]>([]);
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [snapOn, setSnapOn] = useState(false);

  // コース中心線（将来: コース詳細から取得。今は未設定=null=吸着素通り）。
  const courseLine: [number, number][] | null = null;

  // 主催者以外はアクセス不可
  useEffect(() => {
    if (!isOrganizer()) {
      navigate('/login');
    }
  }, [isOrganizer, navigate]);

  // イベント情報取得
  useEffect(() => {
    if (!id) return;
    getEvent(id)
      .then((data) => setEvent(data as EventWithCourse))
      .catch(() => setError('イベント情報の取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [id]);

  // 位置を1秒ごとにポーリング
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await getEventPositions(id);
        if (cancelled) return;
        setActive(data.active);
        setPositions(data.positions);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '位置情報の取得に失敗しました');
      }
    };

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  // 地図の初期中心。コースのコントロールライン、なければ東京駅。
  const course = event?.course || event?.circuit;
  const center: [number, number] = course?.controlLineA
    ? [course.controlLineA.lat, course.controlLineA.lng]
    : [35.681236, 139.767125];

  const shownPositions = active ? positions : [];
  const selected = shownPositions.find((p) => keyOf(p) === selectedKey) || null;

  return (
    <Container maxWidth="xl" sx={{ mt: 2, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate(id ? `/events/${id}` : '/dashboard')}
        >
          戻る
        </Button>
        <MyLocation sx={{ ml: 1, color: 'primary.main' }} />
        <Typography variant="h5" component="h1">
          ライブモニター
        </Typography>
        <Chip
          size="small"
          label={active ? `${positions.length}台がオンライン` : '開催時間外'}
          color={active ? 'success' : 'default'}
        />
        <Box sx={{ flexGrow: 1 }} />
        <ToggleButton
          value="snap"
          size="small"
          selected={snapOn}
          onChange={() => setSnapOn((v) => !v)}
        >
          コース吸着 {snapOn ? 'ON' : 'OFF'}
        </ToggleButton>
      </Box>

      {event && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {event.name}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {!active && !error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          現在はイベント開催時間外のため、参加者の位置は表示されません。
        </Alert>
      )}

      {/* 2ペイン: 左=車載映像 / 右=地図 */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          flexDirection: { xs: 'column', md: 'row' },
        }}
      >
        {/* 左: 車載映像（プレースホルダ＝WebRTC差し込み口） */}
        <Paper
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              px: 1.5,
              py: 1,
              borderBottom: 1,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Videocam fontSize="small" color="primary" />
            <Typography variant="subtitle2">
              車載映像{selected ? `：${selected.zekken ? `No.${selected.zekken} ` : ''}${selected.participantName}` : ''}
            </Typography>
          </Box>
          {id && event?.cameraEnabled ? (
            <CarCameraViewer
              eventId={id}
              participantName={selected ? selected.participantName : null}
              label={selected ? `${selected.zekken ? `No.${selected.zekken} ` : ''}${selected.participantName}` : ''}
            />
          ) : (
            <Box
              sx={{
                flex: 1,
                minHeight: { xs: '32vh', md: '65vh' },
                bgcolor: '#000',
                color: 'grey.500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                p: 2,
              }}
            >
              <Box>
                <Typography variant="body2" sx={{ color: 'grey.300', mb: 1 }}>
                  {event?.cameraEnabled ? '車を選択してください' : '車載カメラ機能は無効です'}
                </Typography>
                <Typography variant="caption">
                  {event?.cameraEnabled
                    ? '下のリストまたはマーカーで車を選ぶと映像が表示されます。'
                    : '統括アカウントで車載カメラ機能を有効にすると利用できます。'}
                </Typography>
              </Box>
            </Box>
          )}
        </Paper>

        {/* 右: 地図 */}
        <Paper sx={{ flex: 1.2, minWidth: 0, overflow: 'hidden' }}>
          <MapContainer
            center={center}
            zoom={15}
            style={{ height: '65vh', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <SmoothMarkers
              positions={shownPositions}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              courseLine={snapOn ? courseLine : null}
            />
          </MapContainer>
        </Paper>
      </Box>

      {/* 下部: 車選択リスト */}
      <Box sx={{ display: 'flex', gap: 1, mt: 2, overflowX: 'auto', pb: 1 }}>
        {shownPositions.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            走行中の車はいません
          </Typography>
        )}
        {shownPositions.map((p) => {
          const k = keyOf(p);
          return (
            <Chip
              key={k}
              label={`${p.zekken ? `No.${p.zekken} ` : ''}${p.participantName}${
                p.secondsAgo <= 30 ? '' : ` (${Math.round(p.secondsAgo / 60)}分前)`
              }`}
              color={k === selectedKey ? 'primary' : 'default'}
              variant={k === selectedKey ? 'filled' : 'outlined'}
              onClick={() => setSelectedKey(k)}
              sx={{ flex: '0 0 auto' }}
            />
          );
        })}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        1秒ごとに自動更新。マーカーは補間で滑らかに移動します。15分以上更新のない参加者は非表示になります。
      </Typography>
    </Container>
  );
}
