// 認証状態管理 (Zustand)

import { create } from 'zustand';
import { User, EventWithCircuit } from '../types';

interface AuthState {
  // 運営者認証
  user: User | null;
  setUser: (user: User | null) => void;

  // イベント参加者認証
  event: EventWithCircuit | null;
  driverName: string | null;
  vehicle: string | null;
  setEventSession: (event: EventWithCircuit, driverName: string, vehicle?: string) => void;

  // ログアウト
  logout: () => void;

  // 認証状態確認
  isAuthenticated: () => boolean;
  isOrganizer: () => boolean;
  isParticipant: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  event: null,
  driverName: null,
  vehicle: null,

  setUser: (user) => set({ user }),

  setEventSession: (event, driverName, vehicle) =>
    set({ event, driverName, vehicle: vehicle || null }),

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
