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
