// 統括(ADMIN)管理API

import { apiClient } from './client';

export type SubscriptionPlan = 'NONE' | 'PERSONAL' | 'ORGANIZER';
export type SubscriptionStatus = 'INACTIVE' | 'ACTIVE' | 'EXPIRED';

export interface AdminUser {
  id: string;
  email: string | null;
  name: string;
  role: 'DRIVER' | 'ORGANIZER' | 'ADMIN';
  isPromo: boolean;
  cameraEnabled: boolean;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionUntil: string | null;
  createdAt: string;
  _count: { events: number; courses: number };
}

// 全ユーザー一覧（ADMINのみ）
export async function getAdminUsers(): Promise<AdminUser[]> {
  return apiClient.get<AdminUser[]>('/admin/users');
}

// 運営アカウントを統括が作成（ADMINのみ）
export async function createOrganizer(data: {
  email: string;
  name: string;
  password: string;
  cameraEnabled?: boolean;
  isPromo?: boolean;
}): Promise<AdminUser> {
  return apiClient.post<AdminUser>('/admin/users', data);
}

// 統括が指定運営として代理ログイン（パス不要・ADMINのみ）
export async function impersonateUser(id: string): Promise<{ ok: boolean; actingAs: { id: string; name: string; email: string | null } }> {
  return apiClient.post(`/admin/users/${id}/impersonate`, {});
}

// 代理ログインを終了して統括に戻る
export async function stopImpersonate(): Promise<{ ok: boolean }> {
  return apiClient.post('/admin/stop-impersonate', {});
}

// 運営アカウントを削除（ADMINのみ。イベント保有時は409）
export async function deleteOrganizer(id: string): Promise<void> {
  return apiClient.delete(`/admin/users/${id}`);
}

// 運営のパスワードを統括がリセット（ADMINのみ）
export async function resetUserPassword(id: string, newPassword: string): Promise<{ ok: boolean }> {
  return apiClient.put(`/admin/users/${id}/password`, { newPassword });
}

// 運営のメール・名前を統括が編集（ADMINのみ）
export async function updateUserProfile(id: string, data: { email?: string; name?: string }): Promise<AdminUser> {
  return apiClient.put<AdminUser>(`/admin/users/${id}/profile`, data);
}

// プロモ枠（課金免除）の付与/解除
export async function setUserPromo(id: string, isPromo: boolean): Promise<AdminUser> {
  return apiClient.put<AdminUser>(`/admin/users/${id}/promo`, { isPromo });
}

// 車載カメラ(ライブ映像)機能の利用可否を切替（ADMINのみ）
export async function setUserCamera(id: string, cameraEnabled: boolean): Promise<AdminUser> {
  return apiClient.put<AdminUser>(`/admin/users/${id}/camera`, { cameraEnabled });
}

// サブスク状態を手動設定（決済連携前の運用）
export async function setUserSubscription(
  id: string,
  data: { plan?: SubscriptionPlan; status?: SubscriptionStatus; until?: string | null }
): Promise<AdminUser> {
  return apiClient.put<AdminUser>(`/admin/users/${id}/subscription`, data);
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
