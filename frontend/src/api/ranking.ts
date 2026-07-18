// ランキングAPI

import { apiClient } from './client';
import type { RankingEntry } from '../types';

/**
 * イベント別ランキングを取得
 */
export async function getEventRanking(eventId: string): Promise<RankingEntry[]> {
  return apiClient.get<RankingEntry[]>(`/laps/ranking?eventId=${encodeURIComponent(eventId)}`);
}

/**
 * サーキット別ランキングを取得
 */
export async function getCircuitRanking(circuitId: string): Promise<RankingEntry[]> {
  return apiClient.get<RankingEntry[]>(`/laps/ranking?circuitId=${encodeURIComponent(circuitId)}`);
}

/**
 * 日付別ランキングを取得
 */
export async function getDateRanking(date: string): Promise<RankingEntry[]> {
  return apiClient.get<RankingEntry[]>(`/laps/ranking?date=${encodeURIComponent(date)}`);
}

/**
 * 全体ランキングを取得
 */
export async function getOverallRanking(): Promise<RankingEntry[]> {
  return apiClient.get<RankingEntry[]>('/laps/ranking');
}
