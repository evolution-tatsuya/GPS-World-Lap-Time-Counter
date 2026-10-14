// サブスク課金の判定ヘルパー
//
// 決済連携(Stripe)前は ADMIN が手動で subscriptionStatus/Until を設定する運用。
// 将来 Stripe Webhook でこれらを更新すれば、判定ロジックはそのまま使える。

interface SubscribableUser {
  isPromo: boolean;
  subscriptionStatus: 'INACTIVE' | 'ACTIVE' | 'EXPIRED' | string;
  subscriptionUntil: Date | null;
}

/**
 * このユーザーが有料機能を使えるか（個人計測など）。
 * - プロモ枠(isPromo)は常に利用可（課金免除）。
 * - サブスクが ACTIVE かつ 有効期限内（期限nullは無期限）なら利用可。
 */
export function canUsePaidFeatures(user: SubscribableUser): boolean {
  if (user.isPromo) return true;
  if (user.subscriptionStatus !== 'ACTIVE') return false;
  if (user.subscriptionUntil && user.subscriptionUntil.getTime() < Date.now()) return false;
  return true;
}

// ===== EC連携（SubscriptionGrant）対応の系統別判定 =====
// GPSは「個人仕様(PERSONAL)」「イベント運営(ORGANIZER)」を同時契約できるため、
// 系統ごとに「有効な契約があるか」を判定する。EC連携が SubscriptionGrant を upsert する。

import { prisma } from '../lib/prisma';
import type { SubscriptionPlan } from '@prisma/client';

/**
 * 指定ユーザーが、指定系統(plan)の有効なサブスク契約を持つか。
 * - プロモ枠(isPromo)は常に true（全系統・課金免除）。
 * - SubscriptionGrant に status=ACTIVE かつ 期限内(until null=無期限) の該当planがあれば true。
 * - 後方互換: 既存 User.subscriptionStatus/Plan(手動運用分)も PERSONAL系統として許可する。
 */
export async function hasActiveGrant(userId: string, plan: SubscriptionPlan): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPromo: true, subscriptionStatus: true, subscriptionUntil: true, subscriptionPlan: true },
  });
  if (!user) return false;
  if (user.isPromo) return true;

  // 後方互換: 旧来の手動設定(User.subscription*)も有効扱い。
  // 旧フィールドは系統を厳密に持たないため、PERSONAL要求時はこれも参照する。
  if (
    plan === 'PERSONAL' &&
    user.subscriptionStatus === 'ACTIVE' &&
    (!user.subscriptionUntil || user.subscriptionUntil.getTime() >= Date.now())
  ) {
    return true;
  }

  const now = new Date();
  const grant = await prisma.subscriptionGrant.findFirst({
    where: {
      userId,
      plan,
      status: 'ACTIVE',
      OR: [{ until: null }, { until: { gte: now } }],
    },
    select: { id: true },
  });
  return grant !== null;
}

/**
 * 指定ユーザーが、指定の機能キー(feature)を使える権利を持つか。
 * プラン(PERSONAL/ORGANIZER)に依存せず「どのGrantであれ、有効かつその機能キーを含むものがあるか」で判定する。
 * → プランの線引きは EC商品の planFeatureKeys で決まり、GPSはキーの有無だけ見る（プラン増減でこの関数は不変）。
 *
 * - isPromo は常に true（全機能免除）。ADMIN は呼び出し側で明示バイパスすること（この関数は role を見ない）。
 * - 判定: status=ACTIVE かつ (until null または未来) かつ features に key を含む Grant が1件でもあれば true。
 *
 * 使用例: if (req.session.role !== 'ADMIN' && !(await hasFeature(userId, 'event_hosting'))) → 402
 */
export async function hasFeature(userId: string, feature: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPromo: true },
  });
  if (!user) return false;
  if (user.isPromo) return true;

  const now = new Date();
  const grant = await prisma.subscriptionGrant.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      features: { has: feature },
      OR: [{ until: null }, { until: { gte: now } }],
    },
    select: { id: true },
  });
  return grant !== null;
}

/**
 * 機能ゲートが本番で有効か（feature flag）。
 * env FEATURE_GATES_ENABLED='true' の時だけゲートが作動する。
 * 既定（未設定/その他）は OFF＝従来通り誰もブロックしない。
 * → EC側の planFeatureKeys 設定・プラン確定が整ってから ON にする運用。
 */
export function featureGatesEnabled(): boolean {
  return process.env.FEATURE_GATES_ENABLED === 'true';
}

/**
 * 運営系API等のゲート判定（route側から呼ぶ）。
 * - flag OFF なら常に許可（従来通り）。
 * - flag ON のとき: ADMINは常に許可、それ以外は hasFeature(userId, feature) で判定。
 * @returns true=許可 / false=402でブロックすべき
 */
export async function gateAllows(role: string | undefined, userId: string, feature: string): Promise<boolean> {
  if (!featureGatesEnabled()) return true; // flag OFF = 従来通り全員許可
  if (role === 'ADMIN') return true;        // 統括は常にバイパス
  return hasFeature(userId, feature);
}
