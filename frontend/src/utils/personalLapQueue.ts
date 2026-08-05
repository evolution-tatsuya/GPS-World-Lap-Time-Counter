// 個人計測ラップの堅牢送信キュー
//
// イベント計測の lapQueue と同じ方式を個人計測用に用意する。
// 電波の弱いサーキットでも個人記録を失わないため:
//  1. ラップ確定時、まず localStorage の未送信キューへ保存
//  2. 成功が確認できるまでキューから消さない
//  3. 一定間隔での自動再送 + 手動flush
// 送信先は createPersonalLap（POST /api/laps/personal）。

import { createPersonalLap } from '../api/laps';
import type { LapCreateInput } from '../types';

const STORAGE_KEY = 'personalLapQueue';

export interface QueuedPersonalLap extends LapCreateInput {
  courseId: string; // どのコースの個人記録か
  vehicle?: string;
  queuedAt: number;
}

function load(): QueuedPersonalLap[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function save(q: QueuedPersonalLap[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(q)); } catch { /* 満杯等は無視 */ }
}

// 未送信件数（全コース or 指定コース）
export function pendingCount(courseId?: string): number {
  const q = load();
  return courseId ? q.filter((l) => l.courseId === courseId).length : q.length;
}

// ラップをキューに積む（送信は flushQueue が行う）
export function enqueuePersonalLap(courseId: string, lap: LapCreateInput, vehicle?: string): void {
  const q = load();
  q.push({ ...lap, courseId, vehicle, queuedAt: Date.now() });
  save(q);
}

let flushing = false;

// 未送信を先頭から順に送る。成功した分だけキューから除く。
// 1件でも失敗したらそこで中断（順序保持）。戻り値: 残った未送信件数。
export async function flushQueue(): Promise<number> {
  if (flushing) return pendingCount();
  flushing = true;
  try {
    while (true) {
      const q = load();
      if (!q.length) break;
      const item = q[0];
      try {
        const { queuedAt: _t, ...payload } = item;
        await createPersonalLap(payload);
        // 成功: 最新状態から同じ項目を除去
        const q2 = load();
        const idx = q2.findIndex(
          (l) => l.queuedAt === item.queuedAt && l.lapNumber === item.lapNumber && l.courseId === item.courseId
        );
        if (idx !== -1) { q2.splice(idx, 1); save(q2); }
      } catch {
        break; // 失敗（電波不良/402等）→ 残して次回再送
      }
    }
  } finally {
    flushing = false;
  }
  return pendingCount();
}
