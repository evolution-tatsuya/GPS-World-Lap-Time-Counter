// イベントコード生成ユーティリティ

import { prisma } from '../index';

/**
 * 6桁の英数字イベントコードを生成
 * 既存のコードと重複しないことを保証
 */
export async function generateEventCode(): Promise<string> {
  // 現場で口頭・手書きでも誤読しないよう、紛らわしい英字を除外する。
  // 数字は 0-9 すべて使用可。除外: O(↔0), I・L(↔1)。
  // ※既存コードに除外文字が含まれていても無効化はしない（生成時のみ新ルール適用）。
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ0123456789';
  let code = '';
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    // 重複チェック
    const existing = await prisma.event.findUnique({
      where: { eventCode: code }
    });

    if (!existing) {
      return code;
    }

    attempts++;
  }

  throw new Error('Failed to generate unique event code');
}

/**
 * イベントコードのバリデーション
 */
export function validateEventCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}
