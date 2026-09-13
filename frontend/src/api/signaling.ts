// 車載映像 WebRTC P2P シグナリング API クライアント
// 握手情報(SDP/ICE)だけを既存バックエンド経由でやり取りする。映像本体はP2P。

import { apiClient } from './client';

// ---- 配信者(ドライバー)側 ----

// 自分の配信offerを登録（新しいofferで握手をリセット）
export async function postOffer(offer: RTCSessionDescriptionInit): Promise<{ key: string }> {
  return apiClient.post('/signaling/offer', { offer: JSON.stringify(offer) });
}

// 配信者のICE候補を追加
export async function postPubIce(candidate: RTCIceCandidateInit): Promise<void> {
  await apiClient.post('/signaling/pub-ice', { candidate: JSON.stringify(candidate) });
}

// viewerのanswerとICE候補を取得
export async function pollPub(): Promise<{ answer: string | null; candidates: string[] }> {
  return apiClient.get('/signaling/pub-poll');
}

// ---- 視聴者(運営)側 ----

export interface PublisherInfo {
  key: string;
  participantName: string;
  vehicle: string | null;
}

// 配信中の車一覧
export async function listPublishers(
  eventId: string,
): Promise<{ active: boolean; publishers: PublisherInfo[] }> {
  return apiClient.get(`/signaling/${encodeURIComponent(eventId)}/list`);
}

// 指定した車のofferと配信者ICE候補を取得
export async function getOffer(
  eventId: string,
  key: string,
): Promise<{ offer: string | null; candidates: string[] }> {
  return apiClient.get(`/signaling/${encodeURIComponent(eventId)}/offer/${encodeURIComponent(key)}`);
}

// answerと自分(viewer)のICE候補を登録（candidateのみの追記も可）
export async function postAnswer(
  eventId: string,
  key: string,
  data: { answer?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit },
): Promise<void> {
  await apiClient.post(`/signaling/${encodeURIComponent(eventId)}/answer/${encodeURIComponent(key)}`, {
    answer: data.answer ? JSON.stringify(data.answer) : undefined,
    candidate: data.candidate ? JSON.stringify(data.candidate) : undefined,
  });
}

// P2P用の公開STUNサーバー（登録不要）。
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};
