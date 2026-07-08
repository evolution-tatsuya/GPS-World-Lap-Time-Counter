// 認証API ルート

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../index';
import { LoginRequest, EventLoginRequest } from '../types';

const router = Router();

// ========== イベントコードログイン（参加者） ==========

/**
 * POST /api/auth/event-login
 * イベントコードでログインし、イベント情報とサーキット情報を取得
 */
router.post('/event-login', async (req: Request, res: Response) => {
  try {
    const { eventCode, driverName, vehicle } = req.body as EventLoginRequest;

    // バリデーション
    if (!eventCode || !driverName) {
      res.status(400).json({ error: 'Event code and driver name are required' });
      return;
    }

    // イベント検索（サーキット情報も含む）
    const event = await prisma.event.findUnique({
      where: { eventCode: eventCode.toUpperCase() },
      include: {
        circuit: true
      }
    });

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // セッション作成
    req.session.eventId = event.id;
    req.session.driverName = driverName;
    req.session.vehicle = vehicle || undefined;

    // レスポンス（サーキット情報を整形）
    res.json({
      event: {
        id: event.id,
        name: event.name,
        eventDate: event.eventDate,
        circuit: {
          id: event.circuit.id,
          name: event.circuit.name,
          country: event.circuit.country,
          state: event.circuit.state,
          controlLineA: {
            lat: Number(event.circuit.controlLineALat),
            lng: Number(event.circuit.controlLineALng)
          },
          controlLineB: {
            lat: Number(event.circuit.controlLineBLat),
            lng: Number(event.circuit.controlLineBLng)
          },
          referenceLapTime: event.circuit.referenceLapTime
        }
      },
      sessionId: req.sessionID
    });
  } catch (error) {
    console.error('Event login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== 運営者ログイン ==========

/**
 * POST /api/auth/login
 * メールアドレスとパスワードで運営者ログイン
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as LoginRequest;

    // バリデーション
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // ユーザー検索
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // パスワード検証
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // セッション作成
    req.session.userId = user.id;
    req.session.role = user.role;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== ユーザー登録 ==========

/**
 * POST /api/auth/register
 * 新規ユーザー登録（運営者）
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, role } = req.body;

    // バリデーション
    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, password, and name are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    // 既存ユーザーチェック
    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    // パスワードハッシュ化
    const passwordHash = await bcrypt.hash(password, 12);

    // ユーザー作成
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: role || 'ORGANIZER'
      }
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== ログアウト ==========

/**
 * POST /api/auth/logout
 * セッション破棄
 */
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      res.status(500).json({ error: 'Failed to logout' });
      return;
    }
    res.json({ success: true });
  });
});

// ========== セッション確認 ==========

/**
 * GET /api/auth/session
 * 現在のセッション情報を取得
 */
router.get('/session', async (req: Request, res: Response) => {
  try {
    if (req.session.userId) {
      // 運営者セッション
      const user = await prisma.user.findUnique({
        where: { id: req.session.userId }
      });

      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      res.json({
        type: 'organizer',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } else if (req.session.eventId) {
      // 参加者セッション
      const event = await prisma.event.findUnique({
        where: { id: req.session.eventId },
        include: { circuit: true }
      });

      if (!event) {
        res.status(401).json({ error: 'Event not found' });
        return;
      }

      res.json({
        type: 'participant',
        event: {
          id: event.id,
          name: event.name,
          circuitName: event.circuit.name
        },
        driverName: req.session.driverName,
        vehicle: req.session.vehicle
      });
    } else {
      res.status(401).json({ error: 'No active session' });
    }
  } catch (error) {
    console.error('Session check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
