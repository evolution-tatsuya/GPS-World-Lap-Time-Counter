// LiveKit トークン取得 API クライアント

import { apiClient } from './client';

export interface LiveKitToken {
  url: string;
  token: string;
  room: string;
  identity: string;
}

// ドライバー: 配信用トークン
export async function getPublishToken(): Promise<LiveKitToken> {
  return apiClient.post<LiveKitToken>('/livekit/token/publish', {});
}

// 運営: 視聴用トークン
export async function getViewToken(eventId: string): Promise<LiveKitToken> {
  return apiClient.post<LiveKitToken>(`/livekit/token/view/${encodeURIComponent(eventId)}`, {});
}

// 観客(ギャラリー): イベントコードで誰でも取得できる公開視聴トークン（ログイン不要）
export async function getPublicViewToken(eventCode: string): Promise<LiveKitToken> {
  return apiClient.post<LiveKitToken>('/livekit/token/view-public', { eventCode });
}
