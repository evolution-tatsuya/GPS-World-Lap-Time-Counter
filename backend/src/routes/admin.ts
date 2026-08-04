// 統括(ADMIN)専用API ルート
// すべて requireAdmin。ユーザー管理・プロモ枠付与など、システム全体の管理操作。

import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { requireAdmin } from '../middleware/auth';

const router = Router();

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
