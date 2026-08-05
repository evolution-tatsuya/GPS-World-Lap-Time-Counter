// 個人計測ラップの堅牢送信キュー
//
// イベント計測の lapQueue と同じ方式を個人計測用に用意する。
// 電波の弱いサーキットでも個人記録を失わないため:
//  1. ラップ確定時、まず localStorage の未送信キューへ保存
//  2. 成功が確認できるまでキューから消さない
//  3. 一定間隔での自動再送 + 手動flush
// 送信先は createPersonalLap（POST /api/laps/personal）。

import { createPersonalLap } from '../api/laps';
import { ApiRequestError } from '../api/client';
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

export interface FlushResult {
  pending: number;
  needsSubscription: boolean; // 402が返った=課金が必要（再送しても無駄なので呼び出し側に通知）
}

// 未送信を先頭から順に送る。成功した分だけキューから除く。
// - ネットワーク断など一時失敗: 中断して次回再送（記録は保全）。
// - 402(課金必要): 再送しても無駄なので中断し、needsSubscription=true で通知（記録は保全）。
export async function flushQueue(): Promise<FlushResult> {
  if (flushing) return { pending: pendingCount(), needsSubscription: false };
  flushing = true;
  let needsSubscription = false;
  try {
    while (true) {
      const q = load();
      if (!q.length) break;
      const item = q[0];
      try {
        const { queuedAt: _t, ...payload } = item;
        await createPersonalLap(payload);
        const q2 = load();
        const idx = q2.findIndex(
          (l) => l.queuedAt === item.queuedAt && l.lapNumber === item.lapNumber && l.courseId === item.courseId
        );
        if (idx !== -1) { q2.splice(idx, 1); save(q2); }
      } catch (e) {
        // 402=課金必要は電波の問題ではないので、通知して中断（記録は残す）
        if (e instanceof ApiRequestError && e.status === 402) needsSubscription = true;
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return { pending: pendingCount(), needsSubscription };
}
