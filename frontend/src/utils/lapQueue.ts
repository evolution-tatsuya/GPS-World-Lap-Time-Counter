// ラップ送信キュー（堅牢送信）
//
// 電波の弱いサーキットでもラップを失わないため、単体HTML版で実証済みの方式を移植:
//  1. ラップ確定時、まず必ず localStorage の未送信キューへ保存
//  2. 送信は「成功が確認できるまで」キューから消さない
//  3. 一定間隔での自動再送 + 手動「今すぐ送信」+ 画面復帰時の再送
//
// createLap は失敗時に throw する（ネットワーク断/非2xx）ので、
// resolve=成功 / throw=後で再送 として扱う。

import { createLap } from '../api/laps';
import type { LapCreateInput } from '../types';

const STORAGE_KEY = 'lapSendQueue';

// キューの1件。eventId を保持し、再ログインで別イベントに送らないようにする。
export interface QueuedLap extends LapCreateInput {
  eventId: string; // このラップが属するイベント
  queuedAt: number; // 追加時刻（デバッグ・並び順用）
}

function load(): QueuedLap[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function save(q: QueuedLap[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
  } catch {
    // localStorage 満杯等は無視（次回の保存で回復を試みる）
  }
}

// 現在のイベントに属する未送信件数
export function pendingCount(eventId: string): number {
  return load().filter((l) => l.eventId === eventId).length;
}

// ラップをキューに積む（送信は flushQueue が行う）
export function enqueueLap(eventId: string, lap: LapCreateInput): void {
  const q = load();
  q.push({ ...lap, eventId, queuedAt: Date.now() });
  save(q);
}

let flushing = false;

// 現在のイベントの未送信を先頭から順に送る。成功した分だけキューから除く。
// 1件でも失敗したらそこで中断し、残りは次回に回す（順序を保つ）。
// 戻り値: 送信を試みた後に残った、このイベントの未送信件数。
export async function flushQueue(eventId: string): Promise<number> {
  if (flushing) return pendingCount(eventId);
  flushing = true;
  try {
    // このイベント以外はそのまま残す（別イベントの分を触らない）
    while (true) {
      const q = load();
      const idx = q.findIndex((l) => l.eventId === eventId);
      if (idx === -1) break; // このイベントの未送信なし
      const item = q[idx];
      try {
        const { eventId: _e, queuedAt: _t, ...payload } = item;
        await createLap(payload);
        // 成功: キューから除去（load し直して最新状態に対して除去）
        const q2 = load();
        const j = q2.findIndex(
          (l) => l.eventId === eventId && l.queuedAt === item.queuedAt && l.lapNumber === item.lapNumber
        );
        if (j !== -1) {
          q2.splice(j, 1);
          save(q2);
        }
      } catch {
        // 失敗: 中断して残す（電波不良等。次回再送）
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return pendingCount(eventId);
}
