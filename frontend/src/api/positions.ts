// 参加者位置共有API

import { apiClient } from './client';

export interface LiveParticipant {
  participantName: string;
  vehicle: string | null;
  lat: number;
  lng: number;
  accuracy: number | null;
  secondsAgo: number;
}

export interface PositionsResponse {
  active: boolean;
  positions: LiveParticipant[];
}

/**
 * 参加者が自分の現在地を送信する（開催時間内のみサーバーが受理）
 */
export async function sendPosition(pos: {
  lat: number;
  lng: number;
  accuracy?: number;
}): Promise<void> {
  await apiClient.post('/positions', pos);
}

/**
 * 主催者が自分のイベントの参加者位置を取得する（開催時間内のみ）
 */
export async function getEventPositions(eventId: string): Promise<PositionsResponse> {
  return apiClient.get<PositionsResponse>(`/positions/${encodeURIComponent(eventId)}`);
}
