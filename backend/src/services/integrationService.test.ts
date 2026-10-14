// EC連携サービスのDB統合テスト。
//
// ⚠️ 本番DB誤爆防止: テスト用DBを TEST_DATABASE_URL で明示指定した時だけ実行する。
//    未設定なら全テストをスキップ（本番Neonを指す DATABASE_URL では絶対に走らせない）。
//    実行例:
//      TEST_DATABASE_URL="postgresql://.../gps_test" npx prisma migrate deploy   # テストDBにスキーマ適用
//      TEST_DATABASE_URL="postgresql://.../gps_test" npm test
//
// 検証内容: provision冪等 / 2系統同時契約 / until / suspend・unsuspend / reactivate / hasActiveGrant。

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const TEST_DB = process.env.TEST_DATABASE_URL;

// テスト用DBが指定されていなければ、DATABASE_URL をそれに差し替えてから prisma を読み込む。
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
}

// describe.skipIf: テストDB未指定ならスキップ（本番DBを触らせない）
const d = TEST_DB ? describe : describe.skip;

d('integrationService (DB統合)', async () => {
  // prisma とサービスは TEST_DATABASE_URL 反映後に動的import
  const { prisma } = await import('../lib/prisma');
  const svc = await import('./integrationService');
  const { hasActiveGrant } = await import('../utils/subscription');

  const EMAIL = 'ec-test-user@example.test';
  const EMAIL2 = 'ec-test-user2@example.test';

  async function cleanup() {
    // テスト用ユーザーに紐づくGrantとUserだけ削除（他データは触らない）
    const users = await prisma.user.findMany({
      where: { email: { in: [EMAIL, EMAIL2] } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length) {
      await prisma.subscriptionGrant.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
  }

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
  beforeEach(cleanup);

  it('provision: 新規は作成(201相当)、同一orderId×planの再送は冪等', async () => {
    const r1 = await svc.provisionFromOrder({ orderId: 'ORD-1', email: EMAIL, plan: 'personal' });
    expect(r1.alreadyProvisioned).toBe(false);
    expect(r1.status).toBe('ACTIVE');

    const r2 = await svc.provisionFromOrder({ orderId: 'ORD-1', email: EMAIL, plan: 'personal' });
    expect(r2.alreadyProvisioned).toBe(true);

    const grants = await prisma.subscriptionGrant.findMany({ where: { provisionOrderId: 'ORD-1' } });
    expect(grants).toHaveLength(1); // 二重発行されない
  });

  it('provision: 同一orderIdでも系統が違えば別契約(カート経路)', async () => {
    await svc.provisionFromOrder({ orderId: 'ORD-2', email: EMAIL, plan: 'personal' });
    await svc.provisionFromOrder({ orderId: 'ORD-2', email: EMAIL, plan: 'organizer' });

    const grants = await prisma.subscriptionGrant.findMany({ where: { provisionOrderId: 'ORD-2' } });
    expect(grants).toHaveLength(2);
    expect(grants.map((g) => g.plan).sort()).toEqual(['ORGANIZER', 'PERSONAL']);
  });

  it('provision: until(ISO日付)を受け取り期限が入る', async () => {
    const until = '2099-12-31T00:00:00.000Z';
    await svc.provisionFromOrder({ orderId: 'ORD-3', email: EMAIL, plan: 'personal', until });
    const g = await prisma.subscriptionGrant.findFirst({ where: { provisionOrderId: 'ORD-3' } });
    expect(g?.until?.toISOString()).toBe(until);
  });

  it('provision: 同一emailの個人+運営の同時契約で1ユーザーに2契約', async () => {
    await svc.provisionFromOrder({ orderId: 'ORD-4a', email: EMAIL, plan: 'personal' });
    await svc.provisionFromOrder({ orderId: 'ORD-4b', email: EMAIL, plan: 'organizer' });
    const user = await prisma.user.findUnique({
      where: { email: EMAIL },
      include: { subscriptionGrants: true },
    });
    expect(user?.subscriptionGrants).toHaveLength(2);
  });

  it('suspend → hasActiveGrant(PERSONAL) が false、unsuspend で true に戻る', async () => {
    await svc.provisionFromOrder({ orderId: 'ORD-5', email: EMAIL, plan: 'personal' });
    const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    const uid = user!.id;

    expect(await hasActiveGrant(uid, 'PERSONAL')).toBe(true);

    await svc.suspendByOrder('ORD-5');
    expect(await hasActiveGrant(uid, 'PERSONAL')).toBe(false);

    await svc.unsuspendByOrder('ORD-5');
    expect(await hasActiveGrant(uid, 'PERSONAL')).toBe(true);
  });

  it('hasActiveGrant: 系統が違えば false（個人契約だけでは運営判定は通らない）', async () => {
    await svc.provisionFromOrder({ orderId: 'ORD-6', email: EMAIL, plan: 'personal' });
    const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    expect(await hasActiveGrant(user!.id, 'PERSONAL')).toBe(true);
    expect(await hasActiveGrant(user!.id, 'ORGANIZER')).toBe(false);
  });

  it('hasActiveGrant: 期限切れ(until過去)は false', async () => {
    await svc.provisionFromOrder({
      orderId: 'ORD-7', email: EMAIL, plan: 'personal',
      until: '2000-01-01T00:00:00.000Z',
    });
    const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    expect(await hasActiveGrant(user!.id, 'PERSONAL')).toBe(false);
  });

  it('reactivate: 旧注文の契約を新注文へ付け替え、ACTIVE復帰', async () => {
    await svc.provisionFromOrder({ orderId: 'ORD-8-old', email: EMAIL, plan: 'personal' });
    await svc.suspendByOrder('ORD-8-old');

    const r = await svc.reactivateByOrder({
      prevOrderId: 'ORD-8-old', newOrderId: 'ORD-8-new', plan: 'personal',
    });
    expect(r.success).toBe(true);

    const old = await prisma.subscriptionGrant.findFirst({ where: { provisionOrderId: 'ORD-8-old' } });
    const neu = await prisma.subscriptionGrant.findFirst({ where: { provisionOrderId: 'ORD-8-new' } });
    expect(old).toBeNull(); // 旧orderIdは消えて
    expect(neu?.status).toBe('ACTIVE'); // 新orderIdでACTIVE
  });

  it('plan-change: until/features を更新できる', async () => {
    await svc.provisionFromOrder({ orderId: 'ORD-9', email: EMAIL, plan: 'personal' });
    await svc.changePlan({
      orderId: 'ORD-9', plan: 'personal',
      until: '2088-01-01T00:00:00.000Z', features: ['personal_measurement'],
    });
    const g = await prisma.subscriptionGrant.findFirst({ where: { provisionOrderId: 'ORD-9' } });
    expect(g?.until?.toISOString()).toBe('2088-01-01T00:00:00.000Z');
    expect(g?.features).toEqual(['personal_measurement']);
  });

  it('存在しないorderIdへのsuspendは success:false', async () => {
    const r = await svc.suspendByOrder('ORD-NOT-EXIST');
    expect(r.success).toBe(false);
  });
});
