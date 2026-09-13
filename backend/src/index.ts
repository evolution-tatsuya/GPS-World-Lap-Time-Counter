// GPS World Lap Time Counter - Backend Server
// Version: 2.0

import express, { Application } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// ルートのインポート
import authRoutes from './routes/auth';
import circuitRoutes from './routes/circuits';
import eventRoutes from './routes/events';
import lapRoutes from './routes/laps';
import positionRoutes from './routes/positions';
import signalingRoutes from './routes/signaling';
import livekitRoutes from './routes/livekit';
import adminRoutes from './routes/admin';

// 環境変数読み込み
dotenv.config();

// Prisma Client インスタンス（Prisma 7ではDriver Adapterが必須）
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });

// Express アプリケーション
const app: Application = express();
const PORT = process.env.PORT || 8432;
const isProduction = process.env.NODE_ENV === 'production';

// Cloud Run 等のリバースプロキシ配下では、これが無いと secure Cookie が発行されない
// （プロキシがTLSを終端し、Expressにはhttpで届くため）。1ホップ先を信頼する。
if (isProduction) {
  app.set('trust proxy', 1);
}

// ========== ミドルウェア設定 ==========

// CORS設定
// 同一オリジン統合構成（Express が API とフロントを同一ドメインで配信）では
// CORSは基本不要だが、別ドメインからのAPI利用も許容できるよう FRONTEND_URL 指定時のみ有効化。
if (process.env.FRONTEND_URL) {
  app.use(
    cors({
      origin: process.env.FRONTEND_URL,
      credentials: true
    })
  );
}

// JSONパーサー
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// セッション設定
// 同一オリジン構成なので sameSite:'lax' でファーストパーティCookieとして動作
// （iOS Safari も Android Chrome も確実に動く）。secure は本番(HTTPS)のみ。
// セッションストアは PostgreSQL(Neon) を使用。MemoryStoreだと Cloud Run の複数
// インスタンス間でセッションが共有されず、ログインが不安定になる＋メモリリークするため。
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      pool,                       // 既存のNeon接続プールを再利用
      tableName: 'user_sessions', // セッション保存テーブル（無ければ自動作成）
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || 'default-secret-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24時間
    }
  })
);

// ========== ルート設定 ==========

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API ルート
app.use('/api/auth', authRoutes);
app.use('/api/circuits', circuitRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/laps', lapRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/signaling', signalingRoutes);
app.use('/api/livekit', livekitRoutes);
app.use('/api/admin', adminRoutes);

// ========== フロントエンド（同一オリジン配信） ==========
// 本番ビルドされた React（frontend/dist）を同じサーバーから配信する。
// これにより API とフロントが同一ドメインになり、CookieがファーストパーティになってiOSでも確実に動く。
// FRONTEND_DIST_PATH で場所を上書き可能（デフォルトはリポジトリ構成に合わせた ../frontend/dist）。
const frontendDist =
  process.env.FRONTEND_DIST_PATH || path.resolve(__dirname, '../../frontend/dist');

if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  // 静的アセット配信
  app.use(express.static(frontendDist));

  // SPAフォールバック: /api・/health 以外のGETは index.html を返す（React Router がクライアント側でルーティング）
  app.get(/^\/(?!api\/|health$).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  console.log(`✓ Serving frontend from: ${frontendDist}`);
} else {
  console.log(`ℹ Frontend build not found at ${frontendDist} (API-only mode)`);
}

// ========== エラーハンドリング ==========

app.use(notFoundHandler);
app.use(errorHandler);

// ========== サーバー起動 ==========

async function startServer() {
  try {
    // 本番では弱いデフォルトシークレットのまま起動させない（セッション偽造防止）
    if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'default-secret-change-this')) {
      console.error('✗ SESSION_SECRET must be set to a strong random value in production. Aborting.');
      process.exit(1);
    }
    if (!process.env.DATABASE_URL) {
      console.error('✗ DATABASE_URL is not set. Aborting.');
      process.exit(1);
    }

    // データベース接続確認
    await prisma.$connect();
    console.log('✓ Database connected');

    // サーバー起動
    app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3247'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// サーバー起動
startServer();
