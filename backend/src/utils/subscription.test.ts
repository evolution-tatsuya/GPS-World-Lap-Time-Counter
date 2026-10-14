// 機能ゲート(hasFeature / gateAllows / featureGatesEnabled)のDB統合テスト。
// ⚠️ 本番DB誤爆防止: TEST_DATABASE_URL を指定した時だけ実行(未設定なら全スキップ)。
//   実行: TEST_DATABASE_URL="postgresql://.../gps_test" npm test

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
const d = TEST_DB ? describe : describe.skip;

d('feature gates (DB統合)', async () => {
  const { prisma } = await import('../lib/prisma');
  const subMod = await import('./subscription');
  const { hasFeature, gateAllows } = subMod;

  const EMAIL = 'gate-test@example.test';
  let userId = '';

  async function cleanup() {
    const u = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    if (u) {
      await prisma.subscriptionGrant.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }
  }

  beforeAll(cleanup);
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });
  beforeEach(async () => {
    await cleanup();
    const u = await prisma.user.create({
      data: { email: EMAIL, name: 'gate test', role: 'ORGANIZER', isPromo: false },
      select: { id: true },
    });
    userId = u.id;
    delete process.env.FEATURE_GATES_ENABLED; // 各テストで明示設定
  });

  it('hasFeature: 該当featureを含むACTIVE Grantがあれば true', async () => {
    await prisma.subscriptionGrant.create({
      data: { userId, provisionOrderId: 'G-1', plan: 'ORGANIZER', status: 'ACTIVE', features: ['event_hosting'] },
    });
    expect(await hasFeature(userId, 'event_hosting')).toBe(true);
    expect(await hasFeature(userId, 'course_create')).toBe(false); // 持っていないfeatureはfalse
  });

  it('hasFeature: INACTIVEなGrantのfeatureは無効', async () => {
    await prisma.subscriptionGrant.create({
      data: { userId, provisionOrderId: 'G-2', plan: 'ORGANIZER', status: 'INACTIVE', features: ['event_hosting'] },
    });
    expect(await hasFeature(userId, 'event_hosting')).toBe(false);
  });

  it('hasFeature: 期限切れ(until過去)のfeatureは無効', async () => {
    await prisma.subscriptionGrant.create({
      data: { userId, provisionOrderId: 'G-3', plan: 'ORGANIZER', status: 'ACTIVE',
        features: ['event_hosting'], until: new Date('2000-01-01') },
    });
    expect(await hasFeature(userId, 'event_hosting')).toBe(false);
  });

  it('hasFeature: isPromo は全feature免除(true)', async () => {
    await prisma.user.update({ where: { id: userId }, data: { isPromo: true } });
    // Grant無しでも isPromo なら true
    expect(await hasFeature(userId, 'event_hosting')).toBe(true);
    expect(await hasFeature(userId, 'any_future_key')).toBe(true);
  });

  it('gateAllows: flag OFF なら常に許可(従来通り・Grant無しでも true)', async () => {
    process.env.FEATURE_GATES_ENABLED = 'false';
    expect(await gateAllows('ORGANIZER', userId, 'event_hosting')).toBe(true);
    delete process.env.FEATURE_GATES_ENABLED; // 未設定も OFF
    expect(await gateAllows('ORGANIZER', userId, 'event_hosting')).toBe(true);
  });

  it('gateAllows: flag ON・権利なし → ブロック(false)', async () => {
    process.env.FEATURE_GATES_ENABLED = 'true';
    expect(await gateAllows('ORGANIZER', userId, 'event_hosting')).toBe(false);
  });

  it('gateAllows: flag ON・ADMIN は常にバイパス(true)', async () => {
    process.env.FEATURE_GATES_ENABLED = 'true';
    expect(await gateAllows('ADMIN', userId, 'event_hosting')).toBe(true);
  });

  it('gateAllows: flag ON・該当feature保有 → 許可(true)', async () => {
    process.env.FEATURE_GATES_ENABLED = 'true';
    await prisma.subscriptionGrant.create({
      data: { userId, provisionOrderId: 'G-4', plan: 'ORGANIZER', status: 'ACTIVE', features: ['event_hosting'] },
    });
    expect(await gateAllows('ORGANIZER', userId, 'event_hosting')).toBe(true);
    // 別featureは保有していないのでブロック
    expect(await gateAllows('ORGANIZER', userId, 'course_create')).toBe(false);
  });
});
