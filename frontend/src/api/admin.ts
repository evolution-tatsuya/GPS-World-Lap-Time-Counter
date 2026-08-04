// 統括(ADMIN)管理API

import { apiClient } from './client';

export interface AdminUser {
  id: string;
  email: string | null;
  name: string;
  role: 'DRIVER' | 'ORGANIZER' | 'ADMIN';
  isPromo: boolean;
  createdAt: string;
  _count: { events: number; courses: number };
}

// 全ユーザー一覧（ADMINのみ）
export async function getAdminUsers(): Promise<AdminUser[]> {
  return apiClient.get<AdminUser[]>('/admin/users');
}

// プロモ枠（課金免除）の付与/解除
export async function setUserPromo(id: string, isPromo: boolean): Promise<AdminUser> {
  return apiClient.put<AdminUser>(`/admin/users/${id}/promo`, { isPromo });
}

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AdminCourse {
  id: string;
  name: string;
  country: string;
  state: string | null;
  courseType: string;
  measureType: 'LAP' | 'ONE_WAY';
  approvalStatus: ApprovalStatus;
  createdAt: string;
  creator: { name: string; email: string | null } | null;
}

// コース一覧（statusで絞込可。省略時は全件）
export async function getAdminCourses(status?: ApprovalStatus): Promise<AdminCourse[]> {
  const q = status ? `?status=${status}` : '';
  return apiClient.get<AdminCourse[]>(`/admin/courses${q}`);
}

// コースの承認ステータスを変更（承認/却下）
export async function setCourseApproval(id: string, status: ApprovalStatus): Promise<AdminCourse> {
  return apiClient.put<AdminCourse>(`/admin/courses/${id}/approval`, { status });
}
