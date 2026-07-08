// イベントAPI ルート

import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { requireOrganizer } from '../middleware/auth';
import { EventCreateInput } from '../types';
import { generateEventCode } from '../utils/eventCodeGenerator';

const router = Router();

// ========== イベント一覧取得 ==========

/**
 * GET /api/events
 * イベント一覧を取得（フィルタ対応）
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const circuitId = typeof req.query.circuitId === 'string' ? req.query.circuitId : undefined;
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const organizerId = typeof req.query.organizerId === 'string' ? req.query.organizerId : undefined;

    const events = await prisma.event.findMany({
      where: {
        ...(circuitId && { circuitId }),
        ...(date && { eventDate: new Date(date) }),
        ...(organizerId && { organizerId }),
        isPublic: true
      },
      include: {
        circuit: true,
        organizer: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { eventDate: 'desc' }
    });

    res.json(events);
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== イベント詳細取得（イベントコード） ==========

/**
 * GET /api/events/:eventCode
 * イベントコードでイベント情報を取得
 */
router.get('/:eventCode', async (req: Request, res: Response) => {
  try {
    const eventCode = req.params.eventCode;

    const event = await prisma.event.findUnique({
      where: { eventCode: eventCode.toUpperCase() },
      include: {
        circuit: true,
        organizer: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // サーキット座標をnumberに変換
    const formattedEvent = {
      ...event,
      circuit: {
        ...event.circuit,
        controlLineA: {
          lat: Number(event.circuit.controlLineALat),
          lng: Number(event.circuit.controlLineALng)
        },
        controlLineB: {
          lat: Number(event.circuit.controlLineBLat),
          lng: Number(event.circuit.controlLineBLng)
        }
      }
    };

    res.json(formattedEvent);
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== イベント作成 ==========

/**
 * POST /api/events
 * 新規イベントを作成（運営者のみ）
 */
router.post('/', requireOrganizer, async (req: Request, res: Response) => {
  try {
    const {
      name,
      circuitId,
      eventDate,
      maxParticipants,
      isPublic
    } = req.body as EventCreateInput;

    // バリデーション
    if (!name || !circuitId || !eventDate) {
      res.status(400).json({ error: 'Required fields are missing' });
      return;
    }

    // サーキット存在チェック
    const circuit = await prisma.circuit.findUnique({
      where: { id: circuitId }
    });

    if (!circuit) {
      res.status(404).json({ error: 'Circuit not found' });
      return;
    }

    // イベントコード生成
    const eventCode = await generateEventCode();

    // イベント作成
    const event = await prisma.event.create({
      data: {
        name,
        circuitId,
        eventDate: new Date(eventDate),
        eventCode,
        maxParticipants: maxParticipants || null,
        isPublic: isPublic !== undefined ? isPublic : true,
        organizerId: req.session.userId!
      },
      include: {
        circuit: true
      }
    });

    res.status(201).json({
      ...event,
      circuit: {
        ...event.circuit,
        controlLineA: {
          lat: Number(event.circuit.controlLineALat),
          lng: Number(event.circuit.controlLineALng)
        },
        controlLineB: {
          lat: Number(event.circuit.controlLineBLat),
          lng: Number(event.circuit.controlLineBLng)
        }
      }
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== イベント更新 ==========

/**
 * PUT /api/events/:id
 * イベント情報を更新（運営者のみ、自分が作成したもののみ）
 */
router.put('/:id', requireOrganizer, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const updates = req.body;

    // 既存イベント取得
    const existing = await prisma.event.findUnique({
      where: { id }
    });

    if (!existing) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // 権限チェック
    if (existing.organizerId !== req.session.userId && req.session.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: You can only update your own events' });
      return;
    }

    // 更新データ準備
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.eventDate !== undefined) updateData.eventDate = new Date(updates.eventDate);
    if (updates.maxParticipants !== undefined) updateData.maxParticipants = updates.maxParticipants;
    if (updates.isPublic !== undefined) updateData.isPublic = updates.isPublic;

    // 更新実行
    const event = await prisma.event.update({
      where: { id },
      data: updateData,
      include: {
        circuit: true
      }
    });

    res.json(event);
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== イベント削除 ==========

/**
 * DELETE /api/events/:id
 * イベントを削除（運営者のみ、自分が作成したもののみ）
 */
router.delete('/:id', requireOrganizer, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    // 既存イベント取得
    const existing = await prisma.event.findUnique({
      where: { id }
    });

    if (!existing) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // 権限チェック
    if (existing.organizerId !== req.session.userId && req.session.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: You can only delete your own events' });
      return;
    }

    // 削除実行（ラップ記録も CASCADE で自動削除される）
    await prisma.event.delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== イベント参加者統計 ==========

/**
 * GET /api/events/:id/stats
 * イベントの統計情報を取得
 */
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    // イベント存在チェック
    const event = await prisma.event.findUnique({
      where: { id }
    });

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // 統計情報取得
    const totalLaps = await prisma.lap.count({
      where: { eventId: id }
    });

    const uniqueDrivers = await prisma.lap.groupBy({
      by: ['driverName'],
      where: { eventId: id }
    });

    const fastestLap = await prisma.lap.findFirst({
      where: { eventId: id },
      orderBy: { lapTimeMs: 'asc' }
    });

    res.json({
      totalLaps,
      totalDrivers: uniqueDrivers.length,
      fastestLap: fastestLap ? {
        driverName: fastestLap.driverName,
        vehicle: fastestLap.vehicle,
        lapTimeStr: fastestLap.lapTimeStr,
        lapTimeMs: fastestLap.lapTimeMs
      } : null
    });
  } catch (error) {
    console.error('Get event stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
