// 認証ミドルウェア

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';

// セッション型定義の拡張
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    role?: UserRole;
    eventId?: string;
    driverName?: string;
    vehicle?: string;
  }
}

/**
 * セッションが存在するか確認
 */
export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.eventId && !req.session.userId) {
    res.status(401).json({ error: 'Unauthorized: Session required' });
    return;
  }
  next();
}

/**
 * 運営者権限が必要
 */
export function requireOrganizer(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Unauthorized: Login required' });
    return;
  }

  if (req.session.role !== 'ORGANIZER' && req.session.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden: Organizer role required' });
    return;
  }

  next();
}

/**
 * 管理者権限が必要
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Unauthorized: Login required' });
    return;
  }

  if (req.session.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden: Admin role required' });
    return;
  }

  next();
}

/**
 * 特定のロールが必要
 */
export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Unauthorized: Login required' });
      return;
    }

    if (req.session.role !== role && req.session.role !== 'ADMIN') {
      res.status(403).json({ error: `Forbidden: ${role} role required` });
      return;
    }

    next();
  };
}
