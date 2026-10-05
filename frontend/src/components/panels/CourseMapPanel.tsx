// コースマップパネル（leaflet）
//
// LiveMap.tsx の leaflet 部分を抽出・パネル化したもの。
// - showPositions=false: コース形状のみ表示（走行位置マーカーは出さない）。
//   現状ダッシュボード(gallery/driver)はこちら。getEventPositionsは運営専用APIのため。
// - showPositions=true: 位置を1秒ポーリングして補間表示＋選択車ハイライト。
//   ※公開positions API 整備後（Phase 5）に有効化する想定。SmoothMarkers はその布石。
//
// マーカークリックで選択車(selectCar)を更新し、他パネルと連動する。

import { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getEvent } from '../../api/events';
import { getEventPositions, type LiveParticipant } from '../../api/positions';
import type { EventWithCourse } from '../../types';
import { useLiveStore, carMatches } from '../../stores/liveStore';

const POLL_MS = 1000;

function keyOf(p: LiveParticipant): string {
  // 選択の正準キーに合わせる: zekken優先、無ければparticipantName
  return p.zekken ?? p.participantName;
}

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

// 補間つきマーカー群（LiveMap.tsx の SmoothMarkers を踏襲）
function SmoothMarkers({
  positions,
  selectedKey,
  onSelect,
}: {
  positions: LiveParticipant[];
  selectedKey: string | null;
  onSelect: (k: string) => void;
}) {
  const map = useMap();
  const stateRef = useRef<Map<string, { marker: L.Marker; prev: { lat: number; lng: number }; target: { lat: number; lng: number }; prevT: number }>>(new Map());
  const rafRef = useRef<number | null>(null);
  const fittedRef = useRef(false);

  useEffect(() => {
    const now = performance.now();
    const store = stateRef.current;
    const seen = new Set<string>();

    positions.forEach((p) => {
      const k = keyOf(p);
      seen.add(k);
      const label = p.zekken || p.participantName.slice(0, 2);
      // 選択ハイライトは carMatches で両対応（順位表がdriverNameで選んでも地図が連動）
      const isSel = carMatches(selectedKey, { zekken: p.zekken, driverName: p.participantName });
      const existing = store.get(k);
      if (!existing) {
        const marker = L.marker([p.lat, p.lng], { icon: participantIcon(label, isSel) })
          .addTo(map)
          .on('click', () => onSelect(k));
        store.set(k, { marker, prev: { lat: p.lat, lng: p.lng }, target: { lat: p.lat, lng: p.lng }, prevT: now });
      } else {
        const cur = existing.marker.getLatLng();
        existing.prev = { lat: cur.lat, lng: cur.lng };
        existing.target = { lat: p.lat, lng: p.lng };
        existing.prevT = now;
        existing.marker.setIcon(participantIcon(label, isSel));
      }
    });

    store.forEach((v, k) => {
      if (!seen.has(k)) { map.removeLayer(v.marker); store.delete(k); }
    });

    if (!fittedRef.current && positions.length > 0) {
      fittedRef.current = true;
      const bounds = L.latLngBounds(positions.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    }
  }, [positions, selectedKey, map, onSelect]);

  useEffect(() => {
    const step = () => {
      const now = performance.now();
      stateRef.current.forEach((v) => {
        const k = Math.min(1, (now - v.prevT) / POLL_MS);
        const lat = v.prev.lat + (v.target.lat - v.prev.lat) * k;
        const lng = v.prev.lng + (v.target.lng - v.prev.lng) * k;
        v.marker.setLatLng([lat, lng]);
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  useEffect(() => {
    const store = stateRef.current;
    return () => { store.forEach((v) => map.removeLayer(v.marker)); store.clear(); };
  }, [map]);

  return null;
}

export default function CourseMapPanel({ eventId, showPositions }: { eventId: string; showPositions: boolean }) {
  const [event, setEvent] = useState<EventWithCourse | null>(null);
  const [positions, setPositions] = useState<LiveParticipant[]>([]);
  const [active, setActive] = useState(true);
  const selectedCarKey = useLiveStore((s) => s.selectedCarKey);
  const selectCar = useLiveStore((s) => s.selectCar);

  // イベント情報（コース中心座標）— idでもeventCodeでも解決される公開API
  useEffect(() => {
    let cancelled = false;
    getEvent(eventId).then((data) => { if (!cancelled) setEvent(data as EventWithCourse); }).catch(() => { /* 形状のみでも表示継続 */ });
    return () => { cancelled = true; };
  }, [eventId]);

  // 位置ポーリング（運営/ドライバーのみ。観客は形状のみ）
  useEffect(() => {
    if (!showPositions) { setPositions([]); return; }
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await getEventPositions(eventId);
        if (cancelled) return;
        setActive(data.active);
        setPositions(data.positions);
      } catch { /* 位置が取れなくても地図は表示継続 */ }
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [eventId, showPositions]);

  // コース中心座標を解決する。APIは course/circuit のどちらか、かつ
  // ネスト形式(controlLineA)・フラット形式(controlLineALat)のどちらかで返すため、
  // 両方をフォールバックで見る。取れなければ東京駅。
  const course = (event?.course || event?.circuit) as
    | { controlLineA?: { lat: number; lng: number }; controlLineALat?: number | string; controlLineALng?: number | string }
    | undefined;
  const resolveCenter = (): [number, number] => {
    if (course?.controlLineA && typeof course.controlLineA.lat === 'number') {
      return [course.controlLineA.lat, course.controlLineA.lng];
    }
    const flatLat = course?.controlLineALat;
    const flatLng = course?.controlLineALng;
    if (flatLat != null && flatLng != null) {
      return [Number(flatLat), Number(flatLng)];
    }
    return [35.681236, 139.767125];
  };
  const center = resolveCenter();

  const shownPositions = showPositions && active ? positions : [];

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, minHeight: 200 }}>
        <MapContainer center={center} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {showPositions && (
            <SmoothMarkers positions={shownPositions} selectedKey={selectedCarKey} onSelect={selectCar} />
          )}
        </MapContainer>
      </Box>
      {!showPositions && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 0.5 }}>
          観戦ビューではコース位置のみ表示しています
        </Typography>
      )}
    </Box>
  );
}
