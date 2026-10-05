// ライブダッシュボード状態管理 (Zustand)
//
// 目的: LiveKitのRoom接続・feeds・選択中の車・パネルのON/OFFを「ページ遷移やパネル切替で
// 切れない場所」に保持する。各ページ内のローカルstateに置くと、アンマウントで接続が切れ・
// 選択状態が失われるため、ここに持ち上げる。
//
// 設計メモ:
// - Room本体は再レンダ対象にしたくない（trackの出入りで毎回描画が走ると重い）ので、
//   モジュールスコープ変数で保持し、storeには「描画に必要な軽い状態」だけ置く。
// - 選択の正準キーは zekken（映像metadata・positions・lap で共通して持つため）。欠損時は driverName。

import { create } from 'zustand';
import {
  Room, RoomEvent, RemoteTrack, RemoteTrackPublication, RemoteParticipant, Participant, Track,
} from 'livekit-client';
import type { PanelKey, DashboardMode, LiveFeed } from '../types';
import { getViewToken, getPublicViewToken } from '../api/livekit';

// 映像の1フィード（表示に必要な分 + track本体）
export interface LiveVideoFeed extends LiveFeed {
  label: string; // 「No.7 名前」など
  track: RemoteTrack | null;
}

// 選択車の一致判定（正準キーは zekken 優先だが、zekken を持たないデータ源=順位表の
// driverName とも連動させるため、どちらのキーでも一致とみなす）。
// selectedCarKey には zekken か driverName のいずれかが入る。candidate 側の zekken/driver
// の両方を照合することで、パネル間（映像↔順位↔地図↔ラップ）の選択が破綻しないようにする。
export function carMatches(
  selectedCarKey: string | null,
  candidate: { zekken?: string | null; driverName?: string | null },
): boolean {
  if (selectedCarKey == null) return false;
  if (candidate.zekken != null && String(candidate.zekken) === selectedCarKey) return true;
  if (candidate.driverName != null && candidate.driverName === selectedCarKey) return true;
  return false;
}

// Room本体は再レンダ非対象（storeの外で保持）
let room: Room | null = null;
let connectSeq = 0; // 二重接続/競合を無効化するためのシーケンス番号

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected';

interface LiveState {
  eventId: string | null;        // LiveKit room = eventId
  eventCode: string | null;      // gallery入口で使ったコード（再接続用）
  mode: DashboardMode;
  status: ConnectionStatus;
  statusMessage: string;
  feeds: LiveVideoFeed[];
  mainIdentity: string | null;   // メイン大画面に出す映像のidentity
  selectedCarKey: string | null; // 選択中の車（zekken正準。映像/地図/順位/ラップ横断）
  panels: Record<PanelKey, boolean>;

  // actions
  connectViewer: (opts: { eventId: string; eventCode?: string; mode: DashboardMode }) => Promise<void>;
  disconnectViewer: () => void;
  setMain: (identity: string) => void;
  selectCar: (carKey: string | null) => void;
  togglePanel: (key: PanelKey) => void;
  setPanel: (key: PanelKey, on: boolean) => void;
}

// participant.metadata(JSON) から表示ラベルとzekken/名前を取り出す
function parseParticipant(p: RemoteParticipant): { label: string; zekken: string | null; driverName: string | null; vehicle: string | null } {
  let name = p.name || p.identity;
  let zekken: string | null = null;
  let vehicle: string | null = null;
  try {
    if (p.metadata) {
      const m = JSON.parse(p.metadata);
      if (m.participantName) name = m.participantName;
      if (m.zekken) zekken = String(m.zekken);
      if (m.vehicle) vehicle = String(m.vehicle);
    }
  } catch { /* noop */ }
  return {
    label: zekken ? `No.${zekken} ${name}` : name,
    zekken,
    driverName: name,
    vehicle,
  };
}

const DEFAULT_PANELS: Record<PanelKey, boolean> = {
  multiview: true,
  ranking: true,
  laptime: true,
  coursemap: true,
};

export const useLiveStore = create<LiveState>((set, get) => {
  // feeds を identity 単位で upsert するヘルパ
  const upsertFeed = (p: RemoteParticipant, track: RemoteTrack | null) => {
    const meta = parseParticipant(p);
    set((state) => {
      const idx = state.feeds.findIndex((f) => f.participantId === p.identity);
      const base: LiveVideoFeed = {
        participantId: p.identity,
        zekken: meta.zekken,
        driverName: meta.driverName,
        vehicle: meta.vehicle,
        label: meta.label,
        track: track ?? (idx >= 0 ? state.feeds[idx].track : null),
      };
      let feeds: LiveVideoFeed[];
      if (idx === -1) feeds = [...state.feeds, base];
      else { feeds = state.feeds.slice(); feeds[idx] = base; }
      // メイン未選択なら最初のfeedを自動選択
      const mainIdentity = state.mainIdentity ?? feeds[0]?.participantId ?? null;
      return { feeds, mainIdentity };
    });
  };

  const removeFeed = (identity: string) => {
    set((state) => ({
      feeds: state.feeds.filter((f) => f.participantId !== identity),
      mainIdentity: state.mainIdentity === identity ? null : state.mainIdentity,
    }));
  };

  const wireRoom = (r: Room) => {
    r
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) => {
        if (track.kind === Track.Kind.Video) upsertFeed(p, track);
      })
      .on(RoomEvent.TrackUnsubscribed, (_t: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) => {
        upsertFeed(p, null);
      })
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        removeFeed(p.identity);
      })
      .on(RoomEvent.ParticipantMetadataChanged, (_m: string | undefined, p?: Participant) => {
        if (p && p instanceof RemoteParticipant) upsertFeed(p, null);
      })
      .on(RoomEvent.Disconnected, () => {
        // 明示的 disconnect 以外（ネット切断等）の場合のみ状態を更新
        if (get().status === 'connected') set({ status: 'disconnected', statusMessage: '切断されました' });
      });
  };

  return {
    eventId: null,
    eventCode: null,
    mode: 'gallery',
    status: 'idle',
    statusMessage: '',
    feeds: [],
    mainIdentity: null,
    selectedCarKey: null,
    panels: { ...DEFAULT_PANELS },

    connectViewer: async ({ eventId, eventCode, mode }) => {
      // 既に同じイベントに接続済みなら何もしない（パネル切替で再接続しない肝）
      if (room && get().eventId === eventId && (get().status === 'connected' || get().status === 'connecting')) {
        set({ mode });
        return;
      }
      // 別イベントへの切替時は既存接続を破棄
      if (room) { try { room.disconnect(); } catch { /* noop */ } room = null; }

      const seq = ++connectSeq;
      set({ eventId, eventCode: eventCode ?? null, mode, status: 'connecting', statusMessage: '接続中…', feeds: [], mainIdentity: null });

      const r = new Room({ adaptiveStream: true });
      room = r;
      wireRoom(r);

      try {
        const { url, token } = eventCode
          ? await getPublicViewToken(eventCode)
          : await getViewToken(eventId);
        if (seq !== connectSeq) { try { r.disconnect(); } catch { /* noop */ } return; }
        await r.connect(url, token);
        if (seq !== connectSeq) { try { r.disconnect(); } catch { /* noop */ } return; }
        set({ status: 'connected', statusMessage: '' });
        // 既に配信中の参加者を拾う
        r.remoteParticipants.forEach((p) => {
          upsertFeed(p, null);
          p.trackPublications.forEach((pub) => {
            if (pub.track && pub.kind === Track.Kind.Video) upsertFeed(p, pub.track);
          });
        });
      } catch (e) {
        if (seq !== connectSeq) return;
        set({ status: 'error', statusMessage: '映像に接続できませんでした' + (e instanceof Error ? `: ${e.message}` : '') });
      }
    },

    disconnectViewer: () => {
      connectSeq++; // 進行中の接続を無効化
      if (room) { try { room.disconnect(); } catch { /* noop */ } room = null; }
      set({
        eventId: null, eventCode: null, status: 'idle', statusMessage: '',
        feeds: [], mainIdentity: null, selectedCarKey: null,
      });
    },

    setMain: (identity) => set({ mainIdentity: identity }),

    selectCar: (carKey) => set({ selectedCarKey: carKey }),

    togglePanel: (key) => set((s) => ({ panels: { ...s.panels, [key]: !s.panels[key] } })),

    setPanel: (key, on) => set((s) => ({ panels: { ...s.panels, [key]: on } })),
  };
});
