// 統括(ADMIN)専用API ルート
// すべて requireAdmin。ユーザー管理・プロモ枠付与など、システム全体の管理操作。

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../index';
import { requireAdmin, requireSession } from '../middleware/auth';

const router = Router();

// ========== 運営アカウント作成（統括による代理発行） ==========

/**
 * POST /api/admin/users
 * 統括が運営(ORGANIZER)アカウントを作成する。
 * body: { email, name, password, cameraEnabled?, isPromo? }
 * 統括自身のセッションは維持したまま、新しい運営を発行できる。
 */
router.post('/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { email, name, password, cameraEnabled, isPromo } = req.body as {
      email?: string; name?: string; password?: string; cameraEnabled?: boolean; isPromo?: boolean;
    };

    if (!email || !name || !password) {
      res.status(400).json({ error: 'email, name, password は必須です' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'パスワードは8文字以上にしてください' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      res.status(409).json({ error: 'このメールアドレスは既に登録されています' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: name.trim(),
        role: 'ORGANIZER',
        cameraEnabled: cameraEnabled === true,
        isPromo: isPromo === true,
      },
      select: {
        id: true, email: true, name: true, role: true,
        isPromo: true, cameraEnabled: true,
        subscriptionPlan: true, subscriptionStatus: true, subscriptionUntil: true,
        createdAt: true,
        _count: { select: { events: true, courses: true } },
      },
    });

    res.status(201).json(user);
  } catch (error) {
    console.error('Admin create organizer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== 代理ログイン（統括が運営として操作） ==========

/**
 * POST /api/admin/users/:id/impersonate
 * 統括が指定運営(ORGANIZER)として操作を開始する。パスワード不要。
 * 元の統括IDを impersonatorId に退避し、戻れるようにする。
 */
router.post('/users/:id/impersonate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!target) { res.status(404).json({ error: 'User not found' }); return; }
    if (target.role !== 'ORGANIZER') {
      res.status(400).json({ error: '代理ログインできるのは運営アカウントのみです' });
      return;
    }

    // 既に代理中なら、まず元の統括を退避元として保持（多重代理はしない）
    const originalAdminId = req.session.impersonatorId || req.session.userId;
    req.session.impersonatorId = originalAdminId;
    req.session.userId = target.id;
    req.session.role = 'ORGANIZER';

    res.json({ ok: true, actingAs: target });
  } catch (error) {
    console.error('Impersonate error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/stop-impersonate
 * 代理ログインを終了し、元の統括(ADMIN)に戻る。代理中の本人が呼ぶ。
 */
router.post('/stop-impersonate', requireSession, async (req: Request, res: Response) => {
  try {
    const adminId = req.session.impersonatorId;
    if (!adminId) { res.status(400).json({ error: '代理ログイン中ではありません' }); return; }
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, role: true },
    });
    if (!admin || admin.role !== 'ADMIN') {
      res.status(403).json({ error: '元の統括アカウントに戻れません' });
      return;
    }
    req.session.userId = admin.id;
    req.session.role = 'ADMIN';
    req.session.impersonatorId = undefined;
    res.json({ ok: true });
  } catch (error) {
    console.error('Stop impersonate error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== 運営アカウント削除 ==========

/**
 * DELETE /api/admin/users/:id
 * 統括が運営(ORGANIZER)アカウントを削除する。
 * イベントを保有している場合は、先にイベント削除を促してブロックする（データ保護）。
 */
router.delete('/users/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (id === req.session.userId) {
      res.status(400).json({ error: '自分自身は削除できません' });
      return;
    }
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, _count: { select: { events: true, courses: true } } },
    });
    if (!target) { res.status(404).json({ error: 'User not found' }); return; }
    if (target.role === 'ADMIN') {
      res.status(400).json({ error: '統括アカウントは削除できません' });
      return;
    }
    if (target._count.events > 0) {
      res.status(409).json({ error: `このアカウントは${target._count.events}件のイベントを保有しています。先にイベントを削除してください。` });
      return;
    }
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== ユーザー一覧 ==========

/**
 * GET /api/admin/users
 * 全ユーザー（運営者/参加者/管理者）を一覧。パスワードハッシュは返さない。
 */
router.get('/users', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isPromo: true,
        cameraEnabled: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptionUntil: true,
        createdAt: true,
        _count: { select: { events: true, courses: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== プロモ枠の付与/解除 ==========

/**
 * PUT /api/admin/users/:id/promo  body: { isPromo: boolean }
 * 指定ユーザーを課金免除のプロモアカウントにする/解除する。
 * これ以降そのユーザーが作るイベントはプロモ枠（課金免除・最大100台）になる。
 */
router.put('/users/:id/promo', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { isPromo } = req.body as { isPromo?: boolean };
    if (typeof isPromo !== 'boolean') {
      res.status(400).json({ error: 'isPromo (boolean) is required' });
      return;
    }
    const user = await prisma.user.update({
      where: { id },
      data: { isPromo },
      select: { id: true, name: true, email: true, role: true, isPromo: true },
    });
    res.json(user);
  } catch (error) {
    console.error('Admin set promo error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== 車載カメラ(ライブ映像)機能の利用可否 ==========

/**
 * PUT /api/admin/users/:id/camera  body: { cameraEnabled: boolean }
 * 指定運営アカウントの車載カメラ機能を有効/無効にする。
 * 有効な運営が作るイベントでのみ、ドライバー/運営が車載映像を使える。
 */
router.put('/users/:id/camera', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { cameraEnabled } = req.body as { cameraEnabled?: boolean };
    if (typeof cameraEnabled !== 'boolean') {
      res.status(400).json({ error: 'cameraEnabled (boolean) is required' });
      return;
    }
    const user = await prisma.user.update({
      where: { id },
      data: { cameraEnabled },
      select: { id: true, name: true, email: true, role: true, cameraEnabled: true },
    });
    res.json(user);
  } catch (error) {
    console.error('Admin set camera error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== サブスク課金の手動設定（決済連携前の運用） ==========

/**
 * PUT /api/admin/users/:id/subscription
 * body: { plan?: 'NONE'|'PERSONAL'|'ORGANIZER', status?: 'INACTIVE'|'ACTIVE'|'EXPIRED', until?: string|null }
 * ADMINがユーザーのサブスク状態を手動で設定する。将来Stripe Webhookが同じ値を更新する。
 */
router.put('/users/:id/subscription', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { plan, status, until } = req.body as {
      plan?: string; status?: string; until?: string | null;
    };
    const data: Record<string, unknown> = {};
    if (plan !== undefined) {
      if (!['NONE', 'PERSONAL', 'ORGANIZER'].includes(plan)) {
        res.status(400).json({ error: 'invalid plan' });
        return;
      }
      data.subscriptionPlan = plan;
    }
    if (status !== undefined) {
      if (!['INACTIVE', 'ACTIVE', 'EXPIRED'].includes(status)) {
        res.status(400).json({ error: 'invalid status' });
        return;
      }
      data.subscriptionStatus = status;
    }
    if (until !== undefined) {
      data.subscriptionUntil = until ? new Date(until) : null;
    }
    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, name: true, email: true, role: true, isPromo: true,
        subscriptionPlan: true, subscriptionStatus: true, subscriptionUntil: true,
      },
    });
    res.json(user);
  } catch (error) {
    console.error('Admin set subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== コース承認 ==========

/**
 * GET /api/admin/courses?status=PENDING
 * コースを承認ステータスで絞って一覧（デフォルトは全件、statusで絞込）。
 */
router.get('/courses', requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const where = status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)
      ? { approvalStatus: status as 'PENDING' | 'APPROVED' | 'REJECTED' }
      : {};
    const courses = await prisma.course.findMany({
      where,
      select: {
        id: true, name: true, country: true, state: true,
        courseType: true, measureType: true, approvalStatus: true,
        createdAt: true,
        creator: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(courses);
  } catch (error) {
    console.error('Admin list courses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/courses/:id/approval  body: { status: 'APPROVED' | 'REJECTED' | 'PENDING' }
 * コースの承認ステータスを変更する。APPROVEDにするとイベントで使えるようになる。
 */
router.put('/courses/:id/approval', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body as { status?: string };
    if (!status || !['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
      res.status(400).json({ error: 'status must be APPROVED, REJECTED or PENDING' });
      return;
    }
    const course = await prisma.course.update({
      where: { id },
      data: { approvalStatus: status as 'APPROVED' | 'REJECTED' | 'PENDING' },
      select: { id: true, name: true, approvalStatus: true },
    });
    res.json(course);
  } catch (error) {
    console.error('Admin course approval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
