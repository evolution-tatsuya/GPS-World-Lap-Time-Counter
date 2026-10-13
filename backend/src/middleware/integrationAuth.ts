// ============================================================
// integrationAuth: EC連携API（/api/integration/*）専用の認証
// ============================================================
// 運営者ログイン(express-session)とは別系統。EC側だけが持つ
// GPS専用の共有シークレット（x-integration-key ヘッダ）で認証する。
// 値は env GPS_INTEGRATION_API_KEY。
// ⚠️ 在庫管理の連携キー(INTEGRATION_API_KEY)とは別の新規発行値。使い回さない。
// タイミング安全な比較で照合し、未設定時は全拒否（フェイルクローズ）。
// 参考実装: 在庫管理 backend/src/middleware/requireIntegration.ts と同型。
// ============================================================

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// 長さ差でも情報を漏らさない定数時間比較
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export const requireIntegrationKey = (req: Request, res: Response, next: NextFunction): void => {
  const configured = process.env.GPS_INTEGRATION_API_KEY;
  // 鍵が未設定なら連携APIは一律拒否（誤って無防備に開かないため）
  if (!configured) {
    res.status(503).json({ error: 'Integration API is not configured' });
    return;
  }
  const provided = req.header('x-integration-key') || '';
  if (!provided || !safeEqual(provided, configured)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};
