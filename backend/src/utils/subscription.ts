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
