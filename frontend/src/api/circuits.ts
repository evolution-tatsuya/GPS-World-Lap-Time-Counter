// サーキットAPI

import { apiClient } from './client';
import type { Circuit, CircuitCreateInput, CircuitUpdateInput } from '../types';

/**
 * サーキット一覧を取得
 */
export async function getCircuits(params?: {
  country?: string;
  state?: string;
}): Promise<Circuit[]> {
  const queryParams = new URLSearchParams();
  if (params?.country) queryParams.append('country', params.country);
  if (params?.state) queryParams.append('state', params.state);

  const query = queryParams.toString();
  return apiClient.get<Circuit[]>(`/circuits${query ? `?${query}` : ''}`);
}

/**
 * サーキット詳細を取得
 */
export async function getCircuit(id: string): Promise<Circuit> {
  return apiClient.get<Circuit>(`/circuits/${id}`);
}

/**
 * サーキットを作成
 */
export async function createCircuit(data: CircuitCreateInput): Promise<Circuit> {
  return apiClient.post<Circuit>('/circuits', data);
}

/**
 * サーキットを更新
 */
export async function updateCircuit(id: string, data: CircuitUpdateInput): Promise<Circuit> {
  return apiClient.put<Circuit>(`/circuits/${id}`, data);
}

/**
 * サーキットを削除
 */
export async function deleteCircuit(id: string): Promise<void> {
  return apiClient.delete(`/circuits/${id}`);
}
