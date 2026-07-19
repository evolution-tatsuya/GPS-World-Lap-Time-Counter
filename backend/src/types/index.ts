// GPS World Lap Time Counter - Type Definitions
// Version: 2.2 (Multi-Sport Support)

import { UserRole, CourseType, SportCategory } from '@prisma/client';

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

// ========== コース関連（マルチスポーツ対応） ==========

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
  courseLength: number | null;
  elevationGain: number | null;
  description: string | null;
  isPublic: boolean;
  createdBy: string | null;
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

// 後方互換性のための型エイリアス
export type Circuit = Course;
export type CircuitCreateInput = CourseCreateInput;

// ========== イベント関連（マルチスポーツ対応） ==========

export interface Event {
  id: string;
  name: string;
  courseId: string;
  sportCategory: SportCategory;
  eventDate: Date;
  startAt: Date | null;
  endAt: Date | null;
  eventCode: string;
  maxParticipants: number | null;
  isPublic: boolean;
  organizerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventCreateInput {
  name: string;
  courseId: string;
  sportCategory: SportCategory;
  eventDate: string | Date;
  maxParticipants?: number;
  isPublic?: boolean;
}

export interface EventWithCourse extends Event {
  course: Course;
}

// ========== ラップ記録関連（マルチスポーツ対応） ==========

export interface Lap {
  id: string;
  eventId: string;
  userId: string | null;
  participantName: string;
  sportCategory: SportCategory;
  vehicleOrGear: string | null;
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
  vehicle?: string; // 互換性のため残す（participantNameとして扱う）
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
