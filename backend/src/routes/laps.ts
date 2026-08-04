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
    const {
      lapNumber, lapTimeMs, lapTimeStr,
      sessionId, sessionName, zekken, klass, tire, note,
    } = req.body as LapCreateInput;

    // バリデーション
    // ※ アウトラップ(lapTimeMs=0)も記録するため、lapTimeMsは「未定義」のみ弾く（0はOK）。
    if (lapNumber == null || lapTimeMs == null || !lapTimeStr) {
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

    // イベントのスポーツカテゴリを取得（ハードコードを避ける）
    const event = await prisma.event.findUnique({
      where: { id: req.session.eventId },
      select: { sportCategory: true },
    });

    // ラップ記録作成
    const lap = await prisma.lap.create({
      data: {
        eventId: req.session.eventId,
        userId: req.session.userId || undefined,
        participantName: req.session.driverName,
        vehicleOrGear: req.session.vehicle || undefined,
        sportCategory: event?.sportCategory || 'CAR', // イベントのカテゴリ、無ければ車
        lapNumber,
        lapTimeMs,
        lapTimeStr,
        sessionId: sessionId || undefined,
        sessionName: sessionName || undefined,
        zekken: zekken || undefined,
        klass: klass || undefined,
        tire: tire || undefined,
        note: note || undefined,
      }
    });

    res.status(201).json(lap);
  } catch (error) {
    console.error('Create lap error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== 個人計測（イベントなし・ログインユーザーのみ） ==========

/**
 * POST /api/laps/personal
 * 個人計測のラップを保存する。イベントに属さず、ログインユーザー(userId)に紐づく。
 * body: { courseId, lapNumber, lapTimeMs, lapTimeStr, session..., zekken/klass/tire/note, vehicle? }
 * - courseId は承認済み(APPROVED)コースのみ。
 * - 参加者(eventセッション)ではなく、ログインユーザー(userId)のみ許可。
 */
router.post('/personal', requireSession, async (req: Request, res: Response) => {
  try {
    // 個人計測はログインユーザー限定（参加者=eventセッションは不可）
    if (!req.session.userId) {
      res.status(403).json({ error: 'Login required for personal measurement' });
      return;
    }
    // 将来: ここで有効なサブスク課金かをチェックする（今はログインで通す）。

    const {
      courseId, lapNumber, lapTimeMs, lapTimeStr, vehicle,
      sessionId, sessionName, zekken, klass, tire, note,
    } = req.body as LapCreateInput & { courseId?: string; vehicle?: string };

    if (!courseId || lapNumber == null || lapTimeMs == null || !lapTimeStr) {
      res.status(400).json({ error: 'Required fields are missing' });
      return;
    }

    // 承認済みコースのみ使える
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    if (course.approvalStatus !== 'APPROVED') {
      res.status(403).json({ error: 'This course is not approved yet' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { name: true },
    });

    const lap = await prisma.lap.create({
      data: {
        eventId: null,
        courseId,
        userId: req.session.userId,
        participantName: user?.name || 'me',
        vehicleOrGear: vehicle || undefined,
        sportCategory: 'CAR',
        lapNumber,
        lapTimeMs,
        lapTimeStr,
        sessionId: sessionId || undefined,
        sessionName: sessionName || undefined,
        zekken: zekken || undefined,
        klass: klass || undefined,
        tire: tire || undefined,
        note: note || undefined,
      },
    });

    res.status(201).json(lap);
  } catch (error) {
    console.error('Create personal lap error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/laps/personal?courseId=
 * 自分(userId)の個人計測ラップ（eventIdなし）を取得。任意でコース絞込。
 * 戻り値: { best: Lap|null, laps: Lap[] }（新しい順）
 */
router.get('/personal', requireSession, async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      res.status(403).json({ error: 'Login required' });
      return;
    }
    const courseId = typeof req.query.courseId === 'string' ? req.query.courseId : undefined;

    const laps = await prisma.lap.findMany({
      where: {
        userId: req.session.userId,
        eventId: null, // 個人計測のみ
        ...(courseId && { courseId }),
        lapTimeMs: { gt: 0 }, // アウトラップ(0)は除外
      },
      orderBy: { recordedAt: 'desc' },
      include: { course: { select: { name: true } } },
    });

    const best = laps.reduce<typeof laps[number] | null>((b, l) => {
      return !b || l.lapTimeMs < b.lapTimeMs ? l : b;
    }, null);

    res.json({ best, laps });
  } catch (error) {
    console.error('Get personal laps error:', error);
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
        ...(driverName && { participantName: driverName })
      },
      include: {
        event: {
          include: {
            course: true
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
      whereClause.event = { courseId: circuitId };
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
            course: true
          }
        }
      },
      orderBy: { lapTimeMs: 'asc' }
    });

    // ドライバーごとにベストタイムを集計
    const bestByDriver = new Map<string, any>();

    for (const lap of laps) {
      // ユーザーIDがあればそれをキーに、なければドライバー名をキーに
      const key = lap.userId || lap.participantName;

      if (!bestByDriver.has(key)) {
        bestByDriver.set(key, {
          driverName: lap.participantName,
          vehicle: lap.vehicleOrGear,
          bestTime: lap.lapTimeStr,
          bestTimeMs: lap.lapTimeMs,
          eventName: lap.event?.name ?? '',
          circuitName: lap.event?.course?.name ?? '',
          recordedAt: lap.recordedAt
        });
      } else {
        const current = bestByDriver.get(key);
        if (lap.lapTimeMs < current.bestTimeMs) {
          bestByDriver.set(key, {
            driverName: lap.participantName,
            vehicle: lap.vehicleOrGear,
            bestTime: lap.lapTimeStr,
            bestTimeMs: lap.lapTimeMs,
            eventName: lap.event?.name ?? '',
            circuitName: lap.event?.course?.name ?? '',
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

// ========== CSVエクスポート（運営者のみ） ==========

/**
 * GET /api/laps/export?eventId=xxx
 * イベントの全ラップ記録をCSVで出力（運営者のみ）
 * ドライバー別ベストタイム順に順位を付与し、全ラップを行として出力
 */
router.get('/export', requireOrganizer, async (req: Request, res: Response) => {
  try {
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined;

    if (!eventId) {
      res.status(400).json({ error: 'eventId is required' });
      return;
    }

    // 対象イベント取得（権限チェック用）
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { course: true },
    });

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // 権限チェック（イベント運営者またはADMIN）
    if (event.organizerId !== req.session.userId && req.session.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: You can only export your own events' });
      return;
    }

    // 全ラップ取得
    const laps = await prisma.lap.findMany({
      where: { eventId },
      orderBy: { recordedAt: 'asc' },
    });

    // ドライバー別ベストタイムを算出して順位を付与
    const bestMsByDriver = new Map<string, number>();
    for (const lap of laps) {
      const key = lap.userId || lap.participantName;
      const current = bestMsByDriver.get(key);
      if (current === undefined || lap.lapTimeMs < current) {
        bestMsByDriver.set(key, lap.lapTimeMs);
      }
    }

    // ベストタイム順で順位マップを作成
    const rankByDriver = new Map<string, number>();
    Array.from(bestMsByDriver.entries())
      .sort((a, b) => a[1] - b[1])
      .forEach(([key], index) => {
        rankByDriver.set(key, index + 1);
      });

    // CSVフィールドのエスケープ（カンマ・改行・ダブルクォート対応）
    const escapeCsv = (value: string | number | null | undefined): string => {
      const str = value === null || value === undefined ? '' : String(value);
      if (/[",\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // ヘッダー行
    const header = [
      '順位',
      'ゼッケン',
      'ドライバー',
      '車両/装備',
      'クラス',
      'セッション',
      'ラップ番号',
      'ラップタイム',
      'ラップタイム(ms)',
      'ベストラップか',
      'タイヤ/天候',
      'メモ',
      '記録日時',
    ];

    // データ行
    const rows = laps.map((lap) => {
      const key = lap.userId || lap.participantName;
      const isBest = lap.lapTimeMs === bestMsByDriver.get(key);
      return [
        rankByDriver.get(key) ?? '',
        lap.zekken ?? '',
        lap.participantName,
        lap.vehicleOrGear ?? '',
        lap.klass ?? '',
        lap.sessionName ?? lap.sessionId ?? '',
        lap.lapNumber,
        lap.lapTimeStr,
        lap.lapTimeMs,
        isBest ? '○' : '',
        lap.tire ?? '',
        lap.note ?? '',
        new Date(lap.recordedAt).toISOString(),
      ];
    });

    const csvBody = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\r\n');

    // Excel(日本語環境)で文字化けしないようUTF-8 BOMを付与
    const csv = '﻿' + csvBody;

    // ファイル名（イベント名とコード。ASCII外は安全なファイル名に置換）
    const safeName = `${event.name}_${event.eventCode}`
      .replace(/[^\w\-]+/g, '_')
      .slice(0, 80);
    const filename = `laps_${safeName || eventId}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.send(csv);
  } catch (error) {
    console.error('Export laps error:', error);
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
        ...(driverName && { participantName: driverName })
      },
      include: {
        event: {
          include: {
            course: true
          }
        }
      },
      orderBy: { recordedAt: 'desc' }
    });

    // イベント別にグループ化
    const eventGroups = new Map<string, any>();

    for (const lap of laps) {
      // 個人計測ラップ(eventIdなし)はイベント別履歴には含めない
      if (!lap.eventId || !lap.event) continue;
      if (!eventGroups.has(lap.eventId)) {
        eventGroups.set(lap.eventId, {
          eventId: lap.eventId,
          eventName: lap.event.name,
          eventDate: lap.event.eventDate,
          circuitName: lap.event.course?.name ?? '',
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

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
    if (lap.event?.organizerId !== req.session.userId && req.session.role !== 'ADMIN') {
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
    const eventId = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;

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
