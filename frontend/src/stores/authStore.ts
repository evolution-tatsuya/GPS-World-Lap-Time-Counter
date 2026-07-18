// 認証状態管理 (Zustand)

import { create } from 'zustand';
import type { User, EventWithCircuit } from '../types';
import { apiClient } from '../api/client';

interface AuthState {
  // 運営者認証
  user: User | null;
  setUser: (user: User | null) => void;

  // イベント参加者認証
  event: EventWithCircuit | null;
  driverName: string | null;
  vehicle: string | null;
  setEventSession: (event: EventWithCircuit, driverName: string, vehicle?: string) => void;

  // セッション復元（リロード対策）
  restoring: boolean;
  restoreSession: () => Promise<void>;

  // ログアウト
  logout: () => void;

  // 認証状態確認
  isAuthenticated: () => boolean;
  isOrganizer: () => boolean;
  isParticipant: () => boolean;
}

// /api/auth/session のレスポンス型
interface SessionResponse {
  type: 'organizer' | 'participant';
  user?: User;
  event?: EventWithCircuit;
  driverName?: string;
  vehicle?: string;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  event: null,
  driverName: null,
  vehicle: null,
  restoring: true,

  setUser: (user) => set({ user }),

  setEventSession: (event, driverName, vehicle) =>
    set({ event, driverName, vehicle: vehicle || null }),

  // アプリ起動時にサーバーのセッションから状態を復元する。
  // これによりページをリロードしてもログイン状態が維持される。
  restoreSession: async () => {
    try {
      const data = await apiClient.get<SessionResponse>('/auth/session');
      if (data.type === 'organizer' && data.user) {
        set({ user: data.user });
      } else if (data.type === 'participant' && data.event) {
        set({
          event: data.event,
          driverName: data.driverName || null,
          vehicle: data.vehicle || null,
        });
      }
    } catch {
      // セッションなし（401等）は正常系。何もしない。
    } finally {
      set({ restoring: false });
    }
  },

  logout: () => set({ user: null, event: null, driverName: null, vehicle: null }),

  isAuthenticated: () => {
    const state = get();
    return !!(state.user || state.event);
  },

  isOrganizer: () => {
    const state = get();
    return !!state.user;
  },

  isParticipant: () => {
    const state = get();
    return !!state.event;
  },
}));
