// 参加者位置ライブマップ（主催者専用）
//
// イベント開催時間内のみ、参加者の現在地を地図上に表示する。
// 3秒ごとにポーリングして自動更新。開催時間外はサーバーが空を返すため
// 「現在は開催時間外です」と表示される。

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
} from '@mui/material';
import { ArrowBack, MyLocation } from '@mui/icons-material';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuthStore } from '../stores/authStore';
import { getEvent } from '../api/events';
import { getEventPositions, type LiveParticipant } from '../api/positions';
import type { EventWithCourse } from '../types';

// Leaflet のデフォルトマーカーアイコンはバンドラ環境でパスが壊れるため、
// CDNを使わずインラインSVGのdivIconで代替する（CSP・オフライン耐性のため）。
function participantIcon(label: string): L.DivIcon {
  const safe = label.replace(/[<>&"]/g, '');
  return L.divIcon({
    className: 'participant-marker',
    html: `<div style="
      background:#E10600;color:#fff;border:2px solid #fff;border-radius:50%;
      width:34px;height:34px;display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:bold;box-shadow:0 1px 4px rgba(0,0,0,.5);
      ">${safe}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
}

// 参加者の位置に合わせて地図の表示範囲を自動調整する補助コンポーネント
function FitBounds({ positions }: { positions: LiveParticipant[] }) {
  const map = useMap();
  const fittedRef = useRef(false);
  useEffect(() => {
    if (positions.length === 0) return;
    // 初回のみ自動フィット（その後は主催者の操作を尊重して勝手に動かさない）
    if (fittedRef.current) return;
    fittedRef.current = true;
    const bounds = L.latLngBounds(positions.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
  }, [positions, map]);
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

  // 主催者以外はアクセス不可
  useEffect(() => {
    if (!isOrganizer()) {
      navigate('/login');
    }
  }, [isOrganizer, navigate]);

  // イベント情報取得（地図の初期中心用にコース座標も使う）
  useEffect(() => {
    if (!id) return;
    getEvent(id)
      .then((data) => setEvent(data as EventWithCourse))
      .catch(() => setError('イベント情報の取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [id]);

  // 位置を3秒ごとにポーリング
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
        // 403（他人のイベント等）は明確に伝える
        setError(err instanceof Error ? err.message : '位置情報の取得に失敗しました');
      }
    };

    poll();
    const timer = setInterval(poll, 3000);
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

  return (
    <Container maxWidth="lg" sx={{ mt: 2, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate(id ? `/events/${id}` : '/dashboard')}
          sx={{ mr: 2 }}
        >
          戻る
        </Button>
        <MyLocation sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="h5" component="h1">
          参加者の現在地
        </Typography>
        <Chip
          size="small"
          label={active ? `${positions.length}人がオンライン` : '開催時間外'}
          color={active ? 'success' : 'default'}
          sx={{ ml: 2 }}
        />
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

      <Paper sx={{ overflow: 'hidden' }}>
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
          {active &&
            positions.map((p) => (
              <Marker
                key={p.participantName}
                position={[p.lat, p.lng]}
                icon={participantIcon(p.vehicle || p.participantName.slice(0, 2))}
              >
                <Popup>
                  <strong>{p.participantName}</strong>
                  <br />
                  {p.vehicle || '車両未設定'}
                  <br />
                  {p.secondsAgo <= 30
                    ? '数秒前に更新'
                    : `${Math.round(p.secondsAgo / 60)}分前に更新`}
                  <br />
                  精度 ±{p.accuracy ? Math.round(p.accuracy) : '?'}m
                </Popup>
              </Marker>
            ))}
          <FitBounds positions={active ? positions : []} />
        </MapContainer>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        3秒ごとに自動更新。15分以上更新のない参加者は非表示になります。
      </Typography>
    </Container>
  );
}
