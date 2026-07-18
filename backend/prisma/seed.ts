// GPS World Lap Time Counter - Database Seed Script
// Version: 2.2 (Multi-Sport Support)

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seeding...');

  // ========== 1. 管理者アカウント作成 ==========
  console.log('\n📝 Creating admin user...');

  const adminEmail = 'admin@gps-world.local';
  const adminPassword = 'Admin2026!';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: hashedPassword,
      name: 'GPS World Admin',
      role: 'ADMIN'
    }
  });

  console.log(`✓ Admin user created: ${admin.email}`);
  console.log(`  Email: ${adminEmail}`);
  console.log(`  Password: ${adminPassword}`);

  // ========== 2. テスト用運営者アカウント作成 ==========
  console.log('\n📝 Creating organizer user...');

  const organizerEmail = 'organizer@gps-world.local';
  const organizerPassword = 'Organizer2026!';
  const hashedOrganizerPassword = await bcrypt.hash(organizerPassword, 10);

  const organizer = await prisma.user.upsert({
    where: { email: organizerEmail },
    update: {},
    create: {
      email: organizerEmail,
      passwordHash: hashedOrganizerPassword,
      name: 'Test Organizer',
      role: 'ORGANIZER'
    }
  });

  console.log(`✓ Organizer user created: ${organizer.email}`);
  console.log(`  Email: ${organizerEmail}`);
  console.log(`  Password: ${organizerPassword}`);

  // ========== 3. テスト用コース（サーキット）作成 ==========
  console.log('\n📝 Creating test courses...');

  // 鈴鹿サーキット（車）
  const suzuka = await prisma.course.upsert({
    where: {
      country_state_name: {
        country: 'Japan',
        state: 'Mie',
        name: 'Suzuka Circuit'
      }
    },
    update: {},
    create: {
      country: 'Japan',
      state: 'Mie',
      name: 'Suzuka Circuit',
      courseType: 'CLOSED_CIRCUIT',
      sportCategories: ['CAR', 'MOTORCYCLE'],
      controlLineALat: 34.8431,
      controlLineALng: 136.5407,
      controlLineBLat: 34.8432,
      controlLineBLng: 136.5408,
      referenceTime: 110000, // 1:50.000
      courseLength: 5.807,
      elevationGain: 45,
      description: '国際レーシングコース - 5.807km',
      isPublic: true,
      createdBy: organizer.id
    }
  });

  console.log(`✓ Course created: ${suzuka.name}`);

  // 富士スピードウェイ（車）
  const fuji = await prisma.course.upsert({
    where: {
      country_state_name: {
        country: 'Japan',
        state: 'Shizuoka',
        name: 'Fuji Speedway'
      }
    },
    update: {},
    create: {
      country: 'Japan',
      state: 'Shizuoka',
      name: 'Fuji Speedway',
      courseType: 'CLOSED_CIRCUIT',
      sportCategories: ['CAR', 'MOTORCYCLE'],
      controlLineALat: 35.3686,
      controlLineALng: 138.9271,
      controlLineBLat: 35.3687,
      controlLineBLng: 138.9272,
      referenceTime: 96000, // 1:36.000
      courseLength: 4.563,
      elevationGain: 40,
      description: 'メインコース - 4.563km',
      isPublic: true,
      createdBy: organizer.id
    }
  });

  console.log(`✓ Course created: ${fuji.name}`);

  // テスト用ランニングコース
  const parkRun = await prisma.course.upsert({
    where: {
      country_state_name: {
        country: 'Japan',
        state: 'Tokyo',
        name: 'Yoyogi Park Running Course'
      }
    },
    update: {},
    create: {
      country: 'Japan',
      state: 'Tokyo',
      name: 'Yoyogi Park Running Course',
      courseType: 'PUBLIC_ROAD',
      sportCategories: ['RUNNING'],
      controlLineALat: 35.6719,
      controlLineALng: 139.6960,
      controlLineBLat: 35.6720,
      controlLineBLng: 139.6961,
      referenceTime: 300000, // 5:00.000 (5分)
      courseLength: 1.5,
      elevationGain: 5,
      description: '代々木公園周回コース - 1.5km',
      isPublic: true,
      createdBy: organizer.id
    }
  });

  console.log(`✓ Course created: ${parkRun.name}`);

  // ========== 4. テスト用イベント作成 ==========
  console.log('\n📝 Creating test events...');

  // 今日の日付で鈴鹿サーキットイベント
  const today = new Date();
  today.setHours(10, 0, 0, 0);

  const suzukaEvent = await prisma.event.upsert({
    where: { eventCode: 'SUZUKA2026' },
    update: {
      name: 'Suzuka Test Session 2026',
      courseId: suzuka.id,
      sportCategory: 'CAR',
      eventDate: today,
      maxParticipants: 50,
      isPublic: true,
      organizerId: organizer.id
    },
    create: {
      name: 'Suzuka Test Session 2026',
      courseId: suzuka.id,
      sportCategory: 'CAR',
      eventDate: today,
      eventCode: 'SUZUKA2026',
      maxParticipants: 50,
      isPublic: true,
      organizerId: organizer.id
    }
  });

  console.log(`✓ Event created: ${suzukaEvent.name}`);
  console.log(`  Event Code: ${suzukaEvent.eventCode}`);
  console.log(`  Date: ${suzukaEvent.eventDate.toLocaleDateString()}`);

  // 明日の日付で富士スピードウェイイベント
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const fujiEvent = await prisma.event.upsert({
    where: { eventCode: 'FUJI2026' },
    update: {
      name: 'Fuji Time Attack 2026',
      courseId: fuji.id,
      sportCategory: 'CAR',
      eventDate: tomorrow,
      maxParticipants: 40,
      isPublic: true,
      organizerId: organizer.id
    },
    create: {
      name: 'Fuji Time Attack 2026',
      courseId: fuji.id,
      sportCategory: 'CAR',
      eventDate: tomorrow,
      eventCode: 'FUJI2026',
      maxParticipants: 40,
      isPublic: true,
      organizerId: organizer.id
    }
  });

  console.log(`✓ Event created: ${fujiEvent.name}`);
  console.log(`  Event Code: ${fujiEvent.eventCode}`);
  console.log(`  Date: ${fujiEvent.eventDate.toLocaleDateString()}`);

  // ランニングイベント（今週末）
  const thisWeekend = new Date();
  thisWeekend.setDate(thisWeekend.getDate() + (7 - thisWeekend.getDay())); // 次の日曜日
  thisWeekend.setHours(9, 0, 0, 0);

  const runningEvent = await prisma.event.upsert({
    where: { eventCode: 'YOYOGI2026' },
    update: {
      name: 'Yoyogi Park Morning Run',
      courseId: parkRun.id,
      sportCategory: 'RUNNING',
      eventDate: thisWeekend,
      maxParticipants: 30,
      isPublic: true,
      organizerId: organizer.id
    },
    create: {
      name: 'Yoyogi Park Morning Run',
      courseId: parkRun.id,
      sportCategory: 'RUNNING',
      eventDate: thisWeekend,
      eventCode: 'YOYOGI2026',
      maxParticipants: 30,
      isPublic: true,
      organizerId: organizer.id
    }
  });

  console.log(`✓ Event created: ${runningEvent.name}`);
  console.log(`  Event Code: ${runningEvent.eventCode}`);
  console.log(`  Date: ${runningEvent.eventDate.toLocaleDateString()}`);

  console.log('\n✅ Database seeding completed successfully!');
  console.log('\n📋 Summary:');
  console.log('  - 2 users (1 admin, 1 organizer)');
  console.log('  - 3 courses (2 racing circuits, 1 running course)');
  console.log('  - 3 events (2 car events, 1 running event)');
  console.log('\n🔑 Login Credentials:');
  console.log('  Admin:');
  console.log(`    Email: ${adminEmail}`);
  console.log(`    Password: ${adminPassword}`);
  console.log('  Organizer:');
  console.log(`    Email: ${organizerEmail}`);
  console.log(`    Password: ${organizerPassword}`);
  console.log('\n🎫 Event Codes:');
  console.log(`  - ${suzukaEvent.eventCode} (Suzuka - Today)`);
  console.log(`  - ${fujiEvent.eventCode} (Fuji - Tomorrow)`);
  console.log(`  - ${runningEvent.eventCode} (Running - This Weekend)`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error('❌ Error during seeding:', e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
