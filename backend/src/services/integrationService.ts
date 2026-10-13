// ============================================================
// EC連携サービス（/api/integration/* の DB処理本体）
// ============================================================
// EC(ショッピングページ)がサーバー間pushで呼ぶ。各処理は冪等。
// GPSは「個人仕様(PERSONAL)」「イベント運営(ORGANIZER)」を同時契約できるため、
// User単一フィールドでなく SubscriptionGrant(1行=1契約) に upsert する。
// 冪等キーは provisionOrderId(@unique)。
// ⚠️ 在庫管理の tenantService とは完全に別物（別テーブル・別キー・別enum）。
// ============================================================

import { prisma } from '../index';
import type { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

// EC→GPS で送られるプラン文字列を GPS enum へ正規化
const PLAN_MAP: Record<string, SubscriptionPlan> = {
  personal: 'PERSONAL',
  PERSONAL: 'PERSONAL',
  organizer: 'ORGANIZER',
  ORGANIZER: 'ORGANIZER',
};

function normalizePlan(plan?: string): SubscriptionPlan | undefined {
  if (plan === undefined || plan === null) return undefined;
  return PLAN_MAP[plan.trim()];
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toUntil(until?: string | null): Date | null | undefined {
  if (until === undefined) return undefined; // 据え置き
  if (until === null || until === '') return null; // 無期限化
  const d = new Date(until);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// provision 時に不足していれば新規ユーザーを作る際のロール決定
function roleForPlan(plan: SubscriptionPlan): 'ORGANIZER' {
  // 個人仕様・イベント運営いずれもログイン可能な運営系ユーザーとして扱う。
  // (DRIVERはイベント参加者用でログイン認証を持たないため、課金ユーザーはORGANIZER固定)
  return 'ORGANIZER';
}

export type ProvisionInput = {
  orderId: string;
  email: string;
  plan?: string;
  billingType?: string;
  productId?: string;
  features?: string[];
  until?: string | null; // 契約期限（EC側がnextBillingDateを送る。契約直後から期限を正しく入れる）
};

export type ProvisionResult = {
  success: boolean;
  alreadyProvisioned: boolean;
  slug: string | null;
  licenseKey: string | null;
  activationUrl: string | null;
  status: string;
};

// POST /provision — 注文からアカウント発行＋契約付与（冪等）
export async function provisionFromOrder(input: ProvisionInput): Promise<ProvisionResult> {
  const orderId = input.orderId.trim();
  const email = normalizeEmail(input.email);
  const plan = normalizePlan(input.plan) ?? 'PERSONAL'; // 省略時は個人仕様とみなす
  const until = toUntil(input.until); // EC側がnextBillingDateを送る。未指定(undefined)は無期限扱い
  const features = Array.isArray(input.features) ? input.features : [];

  // 冪等: (注文番号 × 系統) が一致する再送は二重発行しない。
  // 系統が違えば（同一注文の個人+運営カート購入）別契約として受け入れる。
  const existing = await prisma.subscriptionGrant.findUnique({
    where: { provisionOrderId_plan: { provisionOrderId: orderId, plan } },
    include: { user: { select: { email: true } } },
  });
  if (existing) {
    return {
      success: true,
      alreadyProvisioned: true,
      slug: null,
      licenseKey: null,
      activationUrl: null,
      status: existing.status,
    };
  }

  // email で User を upsert（無ければ ORGANIZER / passwordHash=null で作成）
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: email, // 暫定名（本人が後でアカウント設定で変更）
      role: roleForPlan(plan),
      passwordHash: null,
    },
    update: {}, // 既存ユーザーはそのまま（ロール等は変えない）
    select: { id: true },
  });

  // 契約を1行作成
  const grant = await prisma.subscriptionGrant.create({
    data: {
      userId: user.id,
      provisionOrderId: orderId,
      plan,
      status: 'ACTIVE',
      until: until ?? null,
      billingType: input.billingType ?? null,
      ecProductId: input.productId ?? null,
      features,
    },
    select: { status: true },
  });

  return {
    success: true,
    alreadyProvisioned: false,
    slug: null,
    licenseKey: null,
    activationUrl: null,
    status: grant.status,
  };
}

export type PlanChangeInput = {
  orderId: string;
  plan?: string;
  billingType?: string;
  productId?: string;
  features?: string[];
  until?: string | null;
};

// POST /plan-change — 既存契約の期限/機能/billingTypeを上書き（渡された項目のみ）
// 対象の特定: planが指定されればその系統の契約を、無ければ同一注文の全契約を更新。
// 注) planは「どの系統の契約か」の特定に使う。系統そのものの変更（個人⇄運営）は別契約扱いで非対応。
export async function changePlan(input: PlanChangeInput) {
  const orderId = input.orderId.trim();
  const plan = normalizePlan(input.plan);
  const where = plan !== undefined
    ? { provisionOrderId: orderId, plan }
    : { provisionOrderId: orderId };

  const grants = await prisma.subscriptionGrant.findMany({ where });
  if (grants.length === 0) {
    return { success: false, error: 'grant not found', status: null };
  }
  const data: {
    billingType?: string;
    ecProductId?: string;
    features?: string[];
    until?: Date | null;
  } = {};
  if (input.billingType !== undefined) data.billingType = input.billingType;
  if (input.productId !== undefined) data.ecProductId = input.productId;
  if (Array.isArray(input.features)) data.features = input.features;
  const until = toUntil(input.until);
  if (until !== undefined) data.until = until;

  await prisma.subscriptionGrant.updateMany({ where, data });
  return { success: true, status: grants[0].status, plan: plan ?? null };
}

// POST /suspend — 解約/停止（データ保持・冪等）
// 同一注文で発行した全契約(個人+運営のカート購入なら2件)をまとめて停止する。
export async function suspendByOrder(orderId: string, reason?: string) {
  const id = orderId.trim();
  const grants = await prisma.subscriptionGrant.findMany({ where: { provisionOrderId: id } });
  if (grants.length === 0) return { success: false, error: 'grant not found', status: null };
  const alreadySuspended = grants.every((g) => g.status === 'INACTIVE');
  await prisma.subscriptionGrant.updateMany({
    where: { provisionOrderId: id },
    data: { status: 'INACTIVE' as SubscriptionStatus },
  });
  // reason は現状スキーマに保持列を持たない（将来 note 列追加時に記録）。
  void reason;
  return { success: true, alreadySuspended, status: 'INACTIVE' };
}

// POST /unsuspend — 停止→復帰（冪等）
// 同一注文の全契約をまとめて復帰する。
export async function unsuspendByOrder(orderId: string) {
  const id = orderId.trim();
  const grants = await prisma.subscriptionGrant.findMany({ where: { provisionOrderId: id } });
  if (grants.length === 0) return { success: false, error: 'grant not found', status: null };
  const alreadyActive = grants.every((g) => g.status === 'ACTIVE');
  await prisma.subscriptionGrant.updateMany({
    where: { provisionOrderId: id },
    data: { status: 'ACTIVE' as SubscriptionStatus },
  });
  return { success: true, alreadyActive, status: 'ACTIVE' };
}

export type ReactivateInput = {
  prevOrderId: string;
  newOrderId: string;
  plan?: string;
  billingType?: string;
  productId?: string;
  features?: string[];
  until?: string | null;
};

// POST /reactivate — 解約後の再購入で旧契約(データ)を引き継ぐ（冪等）
// 系統(plan)が指定されればその系統の契約を、無ければ旧注文の契約(複数なら先頭)を付け替える。
export async function reactivateByOrder(input: ReactivateInput) {
  const prevId = input.prevOrderId.trim();
  const newId = input.newOrderId.trim();
  const plan = normalizePlan(input.plan);

  // 冪等: newOrderId(+系統) で既に処理済みなら返す
  const already = await prisma.subscriptionGrant.findFirst({
    where: plan !== undefined
      ? { provisionOrderId: newId, plan }
      : { provisionOrderId: newId },
  });
  if (already) {
    return { success: true, alreadyReactivated: true, status: already.status };
  }
  // 旧契約を取得して付け替え
  const prev = await prisma.subscriptionGrant.findFirst({
    where: plan !== undefined
      ? { provisionOrderId: prevId, plan }
      : { provisionOrderId: prevId },
  });
  if (!prev) return { success: false, error: 'previous grant not found', status: null };

  const data: {
    provisionOrderId: string;
    status: SubscriptionStatus;
    plan?: SubscriptionPlan;
    billingType?: string;
    ecProductId?: string;
    features?: string[];
    until?: Date | null;
  } = {
    provisionOrderId: newId,
    status: 'ACTIVE',
  };
  if (plan !== undefined) data.plan = plan;
  if (input.billingType !== undefined) data.billingType = input.billingType;
  if (input.productId !== undefined) data.ecProductId = input.productId;
  if (Array.isArray(input.features)) data.features = input.features;
  const until = toUntil(input.until);
  if (until !== undefined) data.until = until;

  const updated = await prisma.subscriptionGrant.update({
    where: { id: prev.id },
    data,
    select: { status: true },
  });
  return { success: true, alreadyReactivated: false, status: updated.status };
}
