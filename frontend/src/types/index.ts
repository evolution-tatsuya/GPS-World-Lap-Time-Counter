// GPS World Lap Time Counter - Frontend Type Definitions
// Version: 2.0

// ========== ユーザー関連 ==========

export enum UserRole {
  DRIVER = 'DRIVER',
  ORGANIZER = 'ORGANIZER',
  ADMIN = 'ADMIN'
}

export interface User {
  id: string;
  email: string | null;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

// ========== サーキット関連 ==========

export enum CircuitType {
  CIRCUIT = 'CIRCUIT',
  GYMKHANA = 'GYMKHANA',
  RALLY = 'RALLY',
  OTHER = 'OTHER'
}

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

export interface EventWithCircuit extends Event {
  circuit: Circuit;
}

export interface EventCreateInput {
  name: string;
  circuitId: string;
  eventDate: string | Date;
  maxParticipants?: number;
  isPublic?: boolean;
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

export interface EventLoginResponse {
  event: EventWithCircuit;
  sessionId: string;
}

// ========== GPS計測関連 ==========

export interface GPSPosition {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number;
}

export interface LapData {
  lapNumber: number;
  lapTimeMs: number;
  lapTimeStr: string;
  timestamp: Date;
}
