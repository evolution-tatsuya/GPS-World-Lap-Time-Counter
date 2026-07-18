// GPS World Lap Time Counter - Frontend Type Definitions
// Version: 2.2 (Multi-Sport Support)

// ========== ユーザー関連 ==========

export type UserRole = 'DRIVER' | 'ORGANIZER' | 'ADMIN';

export interface User {
  id: string;
  email: string | null;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

// ========== コース関連（マルチスポーツ対応） ==========

export type CourseType =
  | 'CLOSED_CIRCUIT' // クローズドサーキット（専用コース）
  | 'PUBLIC_ROAD'    // 一般道・公道
  | 'FARM_ROAD'      // 農道・林道
  | 'TRAIL'          // トレイル・山道
  | 'WATER'          // 水上（海・湖・川）
  | 'OTHER';         // その他

export type SportCategory =
  | 'CAR'                // 車（四輪）
  | 'MOTORCYCLE'         // バイク（二輪）
  | 'KART'               // カート
  | 'BICYCLE_ROAD'       // ロードバイク
  | 'BICYCLE_MTB'        // MTB
  | 'BICYCLE_CYCLOCROSS' // シクロクロス
  | 'RUNNING'            // ランニング
  | 'RUNNING_MARATHON'   // マラソン
  | 'RUNNING_TRAIL'      // トレイルランニング
  | 'SKIING'             // スキー
  | 'SNOWBOARDING'       // スノーボード
  | 'BOAT'               // ボート
  | 'CANOE'              // カヌー
  | 'OTHER';             // その他

export interface Course {
  id: string;
  country: string;
  state: string | null;
  name: string;
  courseType: CourseType;
  sportCategories: SportCategory[];
  controlLineA: {
    lat: number;
    lng: number;
  };
  controlLineB: {
    lat: number;
    lng: number;
  };
  referenceTime: number | null;
  referenceLapTime: number | null; // 後方互換性のため（referenceTimeのエイリアス）
  courseLength: number | null;
  elevationGain: number | null;
  description: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseCreateInput {
  country: string;
  state?: string;
  name: string;
  courseType: CourseType;
  sportCategories: SportCategory[];
  controlLineA: {
    lat: number;
    lng: number;
  };
  controlLineB: {
    lat: number;
    lng: number;
  };
  referenceTime?: number;
  courseLength?: number;
  elevationGain?: number;
  description?: string;
  isPublic?: boolean;
}

export interface CourseUpdateInput {
  country?: string;
  state?: string;
  name?: string;
  courseType?: CourseType;
  sportCategories?: SportCategory[];
  controlLineA?: {
    lat: number;
    lng: number;
  };
  controlLineB?: {
    lat: number;
    lng: number;
  };
  referenceTime?: number;
  courseLength?: number;
  elevationGain?: number;
  description?: string;
  isPublic?: boolean;
}

// ========== イベント関連（マルチスポーツ対応） ==========

export interface Event {
  id: string;
  name: string;
  courseId: string;
  circuitId: string; // 後方互換性のため（courseIdのエイリアス）
  sportCategory: SportCategory;
  eventDate: Date;
  eventCode: string;
  maxParticipants: number | null;
  isPublic: boolean;
  organizerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventWithCourse extends Event {
  course: Course;
  circuit: Course; // 後方互換性のためcircuitも追加（courseのエイリアス）
}

export interface EventCreateInput {
  name: string;
  courseId: string;
  sportCategory: SportCategory;
  eventDate: string | Date;
  maxParticipants?: number;
  isPublic?: boolean;
}

export interface EventUpdateInput {
  name?: string;
  sportCategory?: SportCategory;
  eventDate?: string | Date;
  maxParticipants?: number;
  isPublic?: boolean;
}

// ========== ラップ記録関連（マルチスポーツ対応） ==========

export interface Lap {
  id: string;
  eventId: string;
  userId: string | null;
  participantName: string;
  driverName: string; // 後方互換性のため（participantNameのエイリアス）
  sportCategory: SportCategory;
  vehicleOrGear: string | null;
  vehicle: string | null; // 後方互換性のため（vehicleOrGearのエイリアス）
  lapNumber: number;
  lapTimeMs: number;
  lapTimeStr: string;
  recordedAt: Date;
  createdAt: Date; // 後方互換性のため（recordedAtのエイリアス）
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
  event: EventWithCourse;
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

// ========== 後方互換性のための型エイリアス ==========
// フロントエンドの既存コードとの互換性のため、旧型名を維持

export type Circuit = Course;
export type CircuitCreateInput = CourseCreateInput;
export type CircuitUpdateInput = CourseUpdateInput;
export type EventWithCircuit = EventWithCourse;

// ========== ユーティリティ型 ==========

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ErrorResponse {
  error: string;
  code?: string;
}
