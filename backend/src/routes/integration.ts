// ============================================================
// EC連携ルート（/api/integration/*）
// ============================================================
// EC(ショッピングページ)専用の共有シークレット(x-integration-key)で保護。
// 運営者ログイン(express-session)とは別系統。
// ⚠️ 在庫管理の連携とは完全に別（別シークレット・別サービス・別テーブル）。
// 参考: 在庫管理 backend/src/routes/integration.ts と同型。
// ============================================================

import { Router, Request, Response } from 'express';
import { requireIntegrationKey } from '../middleware/integrationAuth';
import {
  provisionFromOrder,
  changePlan,
  suspendByOrder,
  unsuspendByOrder,
  reactivateByOrder,
} from '../services/integrationService';

const router = Router();

// 全ルートをEC連携キーで保護
router.use(requireIntegrationKey);

const ALLOWED_BILLING = ['monthly', 'yearly', 'onetime'];

function isValidEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function badBilling(billingType: unknown): boolean {
  return billingType !== undefined && !ALLOWED_BILLING.includes(String(billingType));
}

// POST /api/integration/provision — 注文からアカウント/契約発行（冪等）
router.post('/provision', async (req: Request, res: Response) => {
  try {
    const { orderId, email, plan, billingType, productId, features } = req.body ?? {};
    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({ error: 'orderId は必須です' });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'email が不正です' });
      return;
    }
    if (badBilling(billingType)) {
      res.status(400).json({ error: 'billingType が不正です' });
      return;
    }
    const result = await provisionFromOrder({ orderId, email, plan, billingType, productId, features });
    res.status(result.alreadyProvisioned ? 200 : 201).json(result);
  } catch (err) {
    console.error('[integration] provision error:', err);
    res.status(500).json({ success: false, error: 'internal error' });
  }
});

// POST /api/integration/plan-change — プラン/期限/機能の上書き
router.post('/plan-change', async (req: Request, res: Response) => {
  try {
    const { orderId, plan, billingType, productId, features, until } = req.body ?? {};
    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({ error: 'orderId は必須です' });
      return;
    }
    if (badBilling(billingType)) {
      res.status(400).json({ error: 'billingType が不正です' });
      return;
    }
    const result = await changePlan({ orderId, plan, billingType, productId, features, until });
    if (!result.success) {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('[integration] plan-change error:', err);
    res.status(500).json({ success: false, error: 'internal error' });
  }
});

// POST /api/integration/suspend — 解約/停止（データ保持・冪等）
router.post('/suspend', async (req: Request, res: Response) => {
  try {
    const { orderId, reason } = req.body ?? {};
    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({ error: 'orderId は必須です' });
      return;
    }
    const result = await suspendByOrder(orderId, reason);
    if (!result.success) {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('[integration] suspend error:', err);
    res.status(500).json({ success: false, error: 'internal error' });
  }
});

// POST /api/integration/unsuspend — 停止→復帰（冪等）
router.post('/unsuspend', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body ?? {};
    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({ error: 'orderId は必須です' });
      return;
    }
    const result = await unsuspendByOrder(orderId);
    if (!result.success) {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('[integration] unsuspend error:', err);
    res.status(500).json({ success: false, error: 'internal error' });
  }
});

// POST /api/integration/reactivate — 再購入で旧契約を引き継ぐ（冪等）
router.post('/reactivate', async (req: Request, res: Response) => {
  try {
    const { prevOrderId, newOrderId, plan, billingType, productId, features, until } = req.body ?? {};
    if (!prevOrderId || typeof prevOrderId !== 'string' || !newOrderId || typeof newOrderId !== 'string') {
      res.status(400).json({ error: 'prevOrderId と newOrderId は必須です' });
      return;
    }
    if (badBilling(billingType)) {
      res.status(400).json({ error: 'billingType が不正です' });
      return;
    }
    const result = await reactivateByOrder({ prevOrderId, newOrderId, plan, billingType, productId, features, until });
    if (!result.success) {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('[integration] reactivate error:', err);
    res.status(500).json({ success: false, error: 'internal error' });
  }
});

export default router;
