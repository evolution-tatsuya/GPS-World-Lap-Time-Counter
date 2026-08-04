// イベントの開催時間帯の判定（位置共有と参加ログインで共通利用）

/**
 * イベントが「開催時間内」かどうかを判定する。
 * startAt/endAt が両方設定されていればその範囲。
 * 未設定なら eventDate 当日(ローカル0:00〜翌0:00)を開催時間とみなす（後方互換）。
 */
export function isWithinEventWindow(event: {
  startAt: Date | null;
  endAt: Date | null;
  eventDate: Date;
}): boolean {
  const now = Date.now();

  if (event.startAt && event.endAt) {
    return now >= event.startAt.getTime() && now <= event.endAt.getTime();
  }

  const day = new Date(event.eventDate);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, 0);
  return now >= start.getTime() && now < end.getTime();
}

// 参加受付を開始する「開催開始の何時間前」から（デフォルト24時間）
const JOIN_LEAD_MS = 24 * 60 * 60 * 1000;

/**
 * イベントコードでの「参加受付が開いているか」を判定する。
 * 位置共有(isWithinEventWindow)より広く、開催開始の24時間前から受け付ける
 * （前日にコードを配って準備できるようにするため）。
 *  - startAt/endAt あり: (startAt - 24h) 〜 endAt
 *  - 未設定: eventDate 前日0:00 〜 当日24:00（前日から準備可能）
 */
export function isJoinWindowOpen(event: {
  startAt: Date | null;
  endAt: Date | null;
  eventDate: Date;
}): boolean {
  const now = Date.now();

  if (event.startAt && event.endAt) {
    const open = event.startAt.getTime() - JOIN_LEAD_MS;
    return now >= open && now <= event.endAt.getTime();
  }

  // 時間帯未設定: 当日0:00の24時間前=前日0:00から、当日終わりまで
  const day = new Date(event.eventDate);
  const open = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 0, 0, 0, 0);
  const close = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, 0);
  return now >= open.getTime() && now < close.getTime();
}
