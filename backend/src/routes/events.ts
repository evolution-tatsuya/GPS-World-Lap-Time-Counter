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
    const courseId = typeof req.query.courseId === 'string' ? req.query.courseId : undefined;
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const organizerId = typeof req.query.organizerId === 'string' ? req.query.organizerId : undefined;

    const events = await prisma.event.findMany({
      where: {
        ...(courseId && { courseId }),
        ...(date && { eventDate: new Date(date) }),
        ...(organizerId && { organizerId }),
        isPublic: true
      },
      include: {
        course: true,
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

// ========== イベント詳細取得（IDまたはイベントコード） ==========

/**
 * GET /api/events/:idOrCode
 * ID（UUID形式）またはイベントコードでイベント情報を取得
 */
router.get('/:idOrCode', async (req: Request, res: Response) => {
  try {
    const idOrCode = Array.isArray(req.params.idOrCode) ? req.params.idOrCode[0] : req.params.idOrCode;

    console.log('[GET /:idOrCode] Received request for:', idOrCode);

    // UUIDの形式チェック（8-4-4-4-12形式）
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);

    console.log('[GET /:idOrCode] Is UUID?', isUUID);

    let event;
    if (isUUID) {
      // UUIDの場合はIDで検索
      console.log('[GET /:idOrCode] Searching by ID...');
      event = await prisma.event.findUnique({
        where: { id: idOrCode },
        include: {
          course: true,
          organizer: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
    } else {
      // それ以外はイベントコードで検索
      console.log('[GET /:idOrCode] Searching by event code:', idOrCode.toUpperCase());
      event = await prisma.event.findUnique({
        where: { eventCode: idOrCode.toUpperCase() },
        include: {
          course: true,
          organizer: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
    }

    console.log('[GET /:idOrCode] Event found?', !!event);

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // コース座標をnumberに変換してcircuitとして返す（フロントエンド互換性）
    const formattedEvent = {
      ...event,
      circuit: {
        ...event.course,
        controlLineA: {
          lat: Number(event.course.controlLineALat),
          lng: Number(event.course.controlLineALng)
        },
        controlLineB: {
          lat: Number(event.course.controlLineBLat),
          lng: Number(event.course.controlLineBLng)
        },
        referenceLapTime: event.course.referenceTime
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
      courseId,
      eventDate,
      startAt,
      endAt,
      maxParticipants,
      isPublic
    } = req.body as {
      name: string;
      courseId: string;
      eventDate: string;
      startAt?: string;
      endAt?: string;
      maxParticipants?: number;
      isPublic?: boolean;
    };

    // バリデーション
    if (!name || !courseId || !eventDate) {
      res.status(400).json({ error: 'Required fields are missing' });
      return;
    }

    // 開催時間帯の妥当性チェック（両方指定時は開始 < 終了）
    if (startAt && endAt && new Date(startAt).getTime() >= new Date(endAt).getTime()) {
      res.status(400).json({ error: 'startAt must be before endAt' });
      return;
    }

    // コース存在チェック
    const course = await prisma.course.findUnique({
      where: { id: courseId }
    });

    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    // イベントコード生成
    const eventCode = await generateEventCode();

    // イベント作成
    const event = await prisma.event.create({
      data: {
        name,
        courseId,
        sportCategory: 'CAR', // デフォルトは車
        eventDate: new Date(eventDate),
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
        eventCode,
        maxParticipants: maxParticipants || null,
        isPublic: isPublic !== undefined ? isPublic : true,
        organizerId: req.session.userId!
      },
      include: {
        course: true
      }
    });

    res.status(201).json({
      ...event,
      circuit: {
        ...event.course,
        controlLineA: {
          lat: Number(event.course.controlLineALat),
          lng: Number(event.course.controlLineALng)
        },
        controlLineB: {
          lat: Number(event.course.controlLineBLat),
          lng: Number(event.course.controlLineBLng)
        },
        referenceLapTime: event.course.referenceTime
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
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
        course: true
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

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
      by: ['participantName'],
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
        driverName: fastestLap.participantName,
        vehicle: fastestLap.vehicleOrGear,
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
