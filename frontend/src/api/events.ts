// イベントAPI

import { apiClient } from './client';
import type { Event, EventCreateInput, EventUpdateInput } from '../types';

/**
 * イベント一覧を取得
 */
export async function getEvents(): Promise<Event[]> {
  return apiClient.get<Event[]>('/events');
}

/**
 * イベント詳細を取得
 */
export async function getEvent(id: string): Promise<Event> {
  return apiClient.get<Event>(`/events/${id}`);
}

/**
 * イベントを作成
 */
export async function createEvent(data: EventCreateInput): Promise<Event> {
  return apiClient.post<Event>('/events', data);
}

/**
 * イベントを更新
 */
export async function updateEvent(id: string, data: EventUpdateInput): Promise<Event> {
  return apiClient.put<Event>(`/events/${id}`, data);
}

/**
 * イベントを削除
 */
export async function deleteEvent(id: string): Promise<void> {
  return apiClient.delete(`/events/${id}`);
}
