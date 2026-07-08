// GPS World Lap Time Counter - Backend Server
// Version: 2.0

import express, { Application } from 'express';
import session from 'express-session';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// ルートのインポート
import authRoutes from './routes/auth';
import circuitRoutes from './routes/circuits';
import eventRoutes from './routes/events';
import lapRoutes from './routes/laps';

// 環境変数読み込み
dotenv.config();

// Prisma Client インスタンス
export const prisma = new PrismaClient();

// Express アプリケーション
const app: Application = express();
const PORT = process.env.PORT || 8432;

// ========== ミドルウェア設定 ==========

// CORS設定
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3247',
    credentials: true
  })
);

// JSONパーサー
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// セッション設定
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'default-secret-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
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

// ========== エラーハンドリング ==========

app.use(notFoundHandler);
app.use(errorHandler);

// ========== サーバー起動 ==========

async function startServer() {
  try {
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
