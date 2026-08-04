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
