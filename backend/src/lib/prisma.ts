// Prisma Client の単一インスタンス。
// index.ts から切り出すことで、サービス層・テストが
// Expressサーバーを起動せずに prisma を import できる。
// （index.ts もここから re-export するので、既存の `from '../index'` は壊れない）
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Prisma 7 では Driver Adapter が必須
// pool は express-session のストア(connect-pg-simple)でも再利用するため export する
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
