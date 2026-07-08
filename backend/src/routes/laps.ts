// ラップ記録API ルート

import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { requireSession, requireOrganizer } from '../middleware/auth';
import { LapCreateInput, RankingEntry } from '../types';

const router = Router();

// ========== ラップ記録送信 ==========

/**
 * POST /api/laps
 * ラップ記録を送信（セッション必須）
 */
router.post('/', requireSession, async (req: Request, res: Response) => {
  try {
    const { lapNumber, lapTimeMs, lapTimeStr } = req.body as LapCreateInput;

    // バリデーション
    if (!lapNumber || !lapTimeMs || !lapTimeStr) {
      res.status(400).json({ error: 'Required fields are missing' });
      return;
    }

    if (!req.session.eventId) {
      res.status(400).json({ error: 'Event session is required' });
      return;
    }

    if (!req.session.driverName) {
      res.status(400).json({ error: 'Driver name is required' });
      return;
    }

    // ラップ記録作成
    const lap = await prisma.lap.create({
      data: {
        eventId: req.session.eventId,
        userId: req.session.userId || undefined,
        driverName: req.session.driverName,
        vehicle: req.session.vehicle || undefined,
        lapNumber,
        lapTimeMs,
        lapTimeStr
      }
    });

    res.status(201).json(lap);
  } catch (error) {
    console.error('Create lap error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== ラップ記録一覧取得 ==========

/**
 * GET /api/laps
 * ラップ記録一覧を取得（フィルタ対応）
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const driverName = typeof req.query.driverName === 'string' ? req.query.driverName : undefined;
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit) : undefined;

    const laps = await prisma.lap.findMany({
      where: {
        ...(eventId && { eventId }),
        ...(userId && { userId }),
        ...(driverName && { driverName })
      },
      include: {
        event: {
          include: {
            circuit: true
          }
        }
      },
      orderBy: { recordedAt: 'desc' },
      ...(limit && { take: limit })
    });

    res.json(laps);
  } catch (error) {
    console.error('Get laps error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== ランキング取得（多軸集計） ==========

/**
 * GET /api/laps/ranking
 * ランキングを取得（イベント別/サーキット別/日付別）
 */
router.get('/ranking', async (req: Request, res: Response) => {
  try {
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined;
    const circuitId = typeof req.query.circuitId === 'string' ? req.query.circuitId : undefined;
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;

    // WHERE句構築
    let whereClause: any = {};

    if (eventId) {
      whereClause.eventId = eventId;
    } else if (circuitId) {
      whereClause.event = { circuitId };
    } else if (date) {
      const startOfDay = new Date(date);
      const endOfDay = new Date(date);
      endOfDay.setDate(endOfDay.getDate() + 1);
      whereClause.recordedAt = { gte: startOfDay, lt: endOfDay };
    }

    // ラップ記録取得
    const laps = await prisma.lap.findMany({
      where: whereClause,
      include: {
        event: {
          include: {
            circuit: true
          }
        }
      },
      orderBy: { lapTimeMs: 'asc' }
    });

    // ドライバーごとにベストタイムを集計
    const bestByDriver = new Map<string, any>();

    for (const lap of laps) {
      // ユーザーIDがあればそれをキーに、なければドライバー名をキーに
      const key = lap.userId || lap.driverName;

      if (!bestByDriver.has(key)) {
        bestByDriver.set(key, {
          driverName: lap.driverName,
          vehicle: lap.vehicle,
          bestTime: lap.lapTimeStr,
          bestTimeMs: lap.lapTimeMs,
          eventName: lap.event.name,
          circuitName: lap.event.circuit.name,
          recordedAt: lap.recordedAt
        });
      } else {
        const current = bestByDriver.get(key);
        if (lap.lapTimeMs < current.bestTimeMs) {
          bestByDriver.set(key, {
            driverName: lap.driverName,
            vehicle: lap.vehicle,
            bestTime: lap.lapTimeStr,
            bestTimeMs: lap.lapTimeMs,
            eventName: lap.event.name,
            circuitName: lap.event.circuit.name,
            recordedAt: lap.recordedAt
          });
        }
      }
    }

    // ランキング配列に変換
    const ranking: RankingEntry[] = Array.from(bestByDriver.values())
      .sort((a, b) => a.bestTimeMs - b.bestTimeMs)
      .map((item, index) => ({
        rank: index + 1,
        ...item
      }));

    res.json(ranking);
  } catch (error) {
    console.error('Get ranking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== 個人履歴取得 ==========

/**
 * GET /api/laps/history
 * ログインユーザーの全ラップ履歴を取得
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const driverName = typeof req.query.driverName === 'string' ? req.query.driverName : undefined;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;

    if (!driverName && !userId) {
      res.status(400).json({ error: 'driverName or userId is required' });
      return;
    }

    const laps = await prisma.lap.findMany({
      where: {
        ...(userId && { userId }),
        ...(driverName && { driverName })
      },
      include: {
        event: {
          include: {
            circuit: true
          }
        }
      },
      orderBy: { recordedAt: 'desc' }
    });

    // イベント別にグループ化
    const eventGroups = new Map<string, any>();

    for (const lap of laps) {
      if (!eventGroups.has(lap.eventId)) {
        eventGroups.set(lap.eventId, {
          eventId: lap.eventId,
          eventName: lap.event.name,
          eventDate: lap.event.eventDate,
          circuitName: lap.event.circuit.name,
          laps: [],
          bestLap: null
        });
      }

      const group = eventGroups.get(lap.eventId);
      group.laps.push({
        id: lap.id,
        lapNumber: lap.lapNumber,
        lapTimeMs: lap.lapTimeMs,
        lapTimeStr: lap.lapTimeStr,
        recordedAt: lap.recordedAt
      });

      // ベストラップ更新
      if (!group.bestLap || lap.lapTimeMs < group.bestLap.lapTimeMs) {
        group.bestLap = {
          lapTimeMs: lap.lapTimeMs,
          lapTimeStr: lap.lapTimeStr
        };
      }
    }

    const history = Array.from(eventGroups.values());

    res.json(history);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== ラップ記録削除（運営者のみ） ==========

/**
 * DELETE /api/laps/:id
 * ラップ記録を削除（運営者のみ）
 */
router.delete('/:id', requireOrganizer, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    // ラップ記録取得
    const lap = await prisma.lap.findUnique({
      where: { id },
      include: {
        event: true
      }
    });

    if (!lap) {
      res.status(404).json({ error: 'Lap not found' });
      return;
    }

    // 権限チェック（イベント運営者またはADMIN）
    if (lap.event.organizerId !== req.session.userId && req.session.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: You can only delete laps from your own events' });
      return;
    }

    // 削除実行
    await prisma.lap.delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete lap error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== イベント内ベストラップ取得 ==========

/**
 * GET /api/laps/best/:eventId
 * イベント内の全体ベストラップを取得
 */
router.get('/best/:eventId', async (req: Request, res: Response) => {
  try {
    const eventId = req.params.eventId;

    const bestLap = await prisma.lap.findFirst({
      where: { eventId },
      orderBy: { lapTimeMs: 'asc' }
    });

    if (!bestLap) {
      res.status(404).json({ error: 'No laps found for this event' });
      return;
    }

    res.json(bestLap);
  } catch (error) {
    console.error('Get best lap error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
