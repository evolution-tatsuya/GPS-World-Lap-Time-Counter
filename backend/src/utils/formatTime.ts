// タイムフォーマットユーティリティ

/**
 * ミリ秒をラップタイム文字列に変換
 * @param ms ミリ秒
 * @returns フォーマット済み文字列 (例: "1:23.456")
 */
export function formatLapTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  } else {
    return `${seconds}.${milliseconds.toString().padStart(3, '0')}`;
  }
}

/**
 * ラップタイム文字列をミリ秒に変換
 * @param timeStr フォーマット済み文字列 (例: "1:23.456")
 * @returns ミリ秒
 */
export function parseLapTime(timeStr: string): number {
  const parts = timeStr.split(':');
  let totalMs = 0;

  if (parts.length === 2) {
    // "1:23.456" 形式
    const minutes = parseInt(parts[0]);
    const secondsParts = parts[1].split('.');
    const seconds = parseInt(secondsParts[0]);
    const milliseconds = parseInt(secondsParts[1] || '0');
    totalMs = minutes * 60 * 1000 + seconds * 1000 + milliseconds;
  } else if (parts.length === 1) {
    // "23.456" 形式
    const secondsParts = parts[0].split('.');
    const seconds = parseInt(secondsParts[0]);
    const milliseconds = parseInt(secondsParts[1] || '0');
    totalMs = seconds * 1000 + milliseconds;
  }

  return totalMs;
}
