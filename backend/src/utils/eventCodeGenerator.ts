// イベントコード生成ユーティリティ

import { prisma } from '../index';

/**
 * 6桁の英数字イベントコードを生成
 * 既存のコードと重複しないことを保証
 */
export async function generateEventCode(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
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
