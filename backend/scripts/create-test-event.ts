// テスト用サーキットとイベントを作成するスクリプト

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// イベントコード生成関数
function generateEventCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function main() {
  console.log('🚀 テスト用データ作成を開始します...\n');

  // 1. テストユーザー作成（運営者）
  const testUser = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      passwordHash: await bcrypt.hash('test1234', 12),
      name: 'テスト運営者',
      role: 'ORGANIZER',
    },
  });

  console.log('✅ テストユーザー作成完了');
  console.log(`   メール: test@example.com`);
  console.log(`   パスワード: test1234\n`);

  // 2. 鈴鹿サーキット作成
  const suzukaCircuit = await prisma.course.upsert({
    where: {
      country_state_name: {
        country: 'Japan',
        state: 'Mie',
        name: 'Suzuka Circuit'
      }
    },
    update: {},
    create: {
      name: 'Suzuka Circuit',
      country: 'Japan',
      state: 'Mie',
      courseType: 'CLOSED_CIRCUIT',
      sportCategories: ['CAR', 'MOTORCYCLE'],
      // 鈴鹿サーキットのコントロールライン座標（実際のメインストレート）
      controlLineALat: 34.843103,
      controlLineALng: 136.540657,
      controlLineBLat: 34.843143,
      controlLineBLng: 136.540757,
      referenceTime: 110000, // 1分50秒（ミリ秒）
      courseLength: '5.807',
      elevationGain: 45,
      description: 'F1日本GPが開催される国際的なサーキット',
      isPublic: true,
    },
  });

  console.log('✅ 鈴鹿サーキット作成完了');
  console.log(`   ID: ${suzukaCircuit.id}`);
  console.log(`   コントロールライン: `);
  console.log(`   地点A: ${suzukaCircuit.controlLineALat}, ${suzukaCircuit.controlLineALng}`);
  console.log(`   地点B: ${suzukaCircuit.controlLineBLat}, ${suzukaCircuit.controlLineBLng}\n`);

  // 3. テストイベント作成
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const testEvent = await prisma.event.create({
    data: {
      name: 'テスト走行会 2026',
      eventCode: generateEventCode(),
      courseId: suzukaCircuit.id,
      organizerId: testUser.id,
      sportCategory: 'CAR',
      eventDate: tomorrow,
      maxParticipants: 50,
      isPublic: true,
    },
  });

  console.log('✅ テストイベント作成完了');
  console.log(`   ID: ${testEvent.id}`);
  console.log(`   イベント名: ${testEvent.name}`);
  console.log(`   イベントコード: ${testEvent.eventCode}`);
  console.log(`   開催日: ${testEvent.eventDate.toLocaleString('ja-JP')}\n`);

  console.log('🎉 すべてのテストデータ作成が完了しました！\n');
  console.log('📝 動作確認手順:');
  console.log('   1. フロントエンド: http://localhost:3248/event-login');
  console.log(`   2. イベントコード: ${testEvent.eventCode}`);
  console.log('   3. ドライバー名: テストドライバー');
  console.log('   4. 車両名: テスト車両');
  console.log('   5. 計測開始ボタンを押すとシミュレーションが開始されます');
  console.log('   6. 約60秒でコントロールラインを通過し、ラップタイムが記録されます\n');
}

main()
  .catch((e) => {
    console.error('❌ エラーが発生しました:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
