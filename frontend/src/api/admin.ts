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
