// ラップ記録API

import { apiClient } from './client';
import type { LapCreateInput, Lap } from '../types';

/**
 * ラップ記録を送信
 */
export async function createLap(data: LapCreateInput): Promise<Lap> {
  return apiClient.post<Lap>('/laps', data);
}

/**
 * 自分のラップ記録一覧を取得
 */
export async function getMyLaps(eventId: string): Promise<Lap[]> {
  return apiClient.get<Lap[]>(`/laps?eventId=${eventId}`);
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * イベントの全ラップ記録をCSVでダウンロード（運営者のみ）
 * CSVはJSONではないため apiClient を使わず、Blobで直接ダウンロードさせる
 */
export async function exportEventLapsCsv(eventId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/laps/export?eventId=${encodeURIComponent(eventId)}`,
    {
      method: 'GET',
      credentials: 'include',
    }
  );

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      message = err.error || message;
    } catch {
      // ボディがJSONでない場合はステータスのみ
    }
    throw new Error(message);
  }

  // Content-Disposition からファイル名を取り出す（無ければフォールバック）
  const disposition = response.headers.get('Content-Disposition') || '';
  let filename = `laps_${eventId}.csv`;
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const asciiMatch = disposition.match(/filename="([^"]+)"/i);
  if (utf8Match) {
    filename = decodeURIComponent(utf8Match[1]);
  } else if (asciiMatch) {
    filename = asciiMatch[1];
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
