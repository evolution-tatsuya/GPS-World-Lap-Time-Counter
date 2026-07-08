// GPS World Lap Time Counter - Type Definitions
// Version: 2.0

import { UserRole, CircuitType } from '@prisma/client';

// ========== ユーザー関連 ==========

export interface User {
  id: string;
  email: string | null;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCreateInput {
  email?: string;
  password?: string;
  name: string;
  role?: UserRole;
}

// ========== サーキット関連 ==========

export interface Circuit {
  id: string;
  country: string;
  state: string | null;
  name: string;
  type: CircuitType;
  controlLineA: {
    lat: number;
    lng: number;
  };
  controlLineB: {
    lat: number;
    lng: number;
  };
  referenceLapTime: number | null;
  description: string | null;
  isPublic: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CircuitCreateInput {
  country: string;
  state?: string;
  name: string;
  type: CircuitType;
  controlLineA: {
    lat: number;
    lng: number;
  };
  controlLineB: {
    lat: number;
    lng: number;
  };
  referenceLapTime?: number;
  description?: string;
  isPublic?: boolean;
}

// ========== イベント関連 ==========

export interface Event {
  id: string;
  name: string;
  circuitId: string;
  eventDate: Date;
  eventCode: string;
  maxParticipants: number | null;
  isPublic: boolean;
  organizerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventCreateInput {
  name: string;
  circuitId: string;
  eventDate: string | Date;
  maxParticipants?: number;
  isPublic?: boolean;
}

export interface EventWithCircuit extends Event {
  circuit: Circuit;
}

// ========== ラップ記録関連 ==========

export interface Lap {
  id: string;
  eventId: string;
  userId: string | null;
  driverName: string;
  vehicle: string | null;
  lapNumber: number;
  lapTimeMs: number;
  lapTimeStr: string;
  recordedAt: Date;
}

export interface LapCreateInput {
  lapNumber: number;
  lapTimeMs: number;
  lapTimeStr: string;
}

export interface RankingEntry {
  rank: number;
  driverName: string;
  vehicle: string | null;
  bestTime: string;
  bestTimeMs: number;
  eventName: string;
  circuitName: string;
  recordedAt: Date;
}

// ========== 認証関連 ==========

export interface LoginRequest {
  email: string;
  password: string;
}

export interface EventLoginRequest {
  eventCode: string;
  driverName: string;
  vehicle?: string;
}

export interface SessionData {
  userId?: string;
  role?: UserRole;
  eventId?: string;
  driverName?: string;
  vehicle?: string;
}

// ========== API レスポンス ==========

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ErrorResponse {
  error: string;
  code?: string;
}
