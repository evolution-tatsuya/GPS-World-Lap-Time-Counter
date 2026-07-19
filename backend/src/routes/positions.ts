// 参加者位置共有API ルート
//
// セキュリティ設計（悪用防止）:
// - 位置はメモリ上にのみ保持し、DBには保存しない（後から軌跡を漁られない）
// - イベントの開催時間帯(startAt〜endAt)の外では送信も取得も一切拒否する
//   （フロントを信用せず、サーバー側で強制する）
// - 主催者は「自分が主催するイベント」の位置しか取得できない
// - 一定時間(OFFLINE_MS)更新のない参加者は取得結果から除外する
// - サーバー再起動でメモリ上の位置は全消去される

import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { requireSession, requireOrganizer } from '../middleware/auth';

const router = Router();

// 参加者1人分の最新位置
interface LivePosition {
  participantName: string;
  vehicle: string | null;
  lat: number;
  lng: number;
  accuracy: number | null;
  updatedAt: number; // epoch ms
}

// eventId -> (participantKey -> LivePosition) のメモリストア
const positionStore = new Map<string, Map<string, LivePosition>>();

// これ以上更新がない参加者はオフライン扱い（赤旗中断等を考慮して15分）
const OFFLINE_MS = 15 * 60 * 1000;

/**
 * イベントが「開催時間内」かどうかを判定する。
 * startAt/endAt が両方未設定の場合は eventDate 当日(ローカル0:00〜翌0:00)を開催時間とみなす。
 * 位置共有はこの時間内でのみ許可される。
 */
function isWithinEventWindow(event: {
  startAt: Date | null;
  endAt: Date | null;
  eventDate: Date;
}): boolean {
  const now = Date.now();

  if (event.startAt && event.endAt) {
    return now >= event.startAt.getTime() && now <= event.endAt.getTime();
  }

  // 後方互換: 時間帯未設定なら eventDate の当日のみ許可
  const day = new Date(event.eventDate);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, 0);
  return now >= start.getTime() && now < end.getTime();
}

// ========== 参加者: 現在地を送信 ==========

/**
 * POST /api/positions
 * 参加者が自分の現在地を送信する（開催時間内のみ受理）
 */
router.post('/', requireSession, async (req: Request, res: Response) => {
  try {
    const eventId = req.session.eventId;
    const participantName = req.session.driverName;

    // 参加者セッションであること
    if (!eventId || !participantName) {
      res.status(403).json({ error: 'Participant session is required' });
      return;
    }

    const { lat, lng, accuracy } = req.body as {
      lat?: number;
      lng?: number;
      accuracy?: number;
    };

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      res.status(400).json({ error: 'lat and lng are required numbers' });
      return;
    }

    // イベント取得＋開催時間チェック
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, startAt: true, endAt: true, eventDate: true },
    });

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    if (!isWithinEventWindow(event)) {
      // 開催時間外は保存しない。既存位置も消しておく。
      positionStore.get(eventId)?.delete(req.session.userId || participantName);
      res.status(403).json({ error: 'Event is not currently active' });
      return;
    }

    // メモリに最新位置を保存
    let eventMap = positionStore.get(eventId);
    if (!eventMap) {
      eventMap = new Map();
      positionStore.set(eventId, eventMap);
    }
    const key = req.session.userId || participantName;
    eventMap.set(key, {
      participantName,
      vehicle: req.session.vehicle || null,
      lat,
      lng,
      accuracy: typeof accuracy === 'number' ? accuracy : null,
      updatedAt: Date.now(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Post position error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== 主催者: 参加者位置を取得 ==========

/**
 * GET /api/positions/:eventId
 * 主催者が自分のイベントの参加者位置一覧を取得する（開催時間内のみ）
 */
router.get('/:eventId', requireOrganizer, async (req: Request, res: Response) => {
  try {
    const eventId = Array.isArray(req.params.eventId)
      ? req.params.eventId[0]
      : req.params.eventId;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        organizerId: true,
        startAt: true,
        endAt: true,
        eventDate: true,
      },
    });

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // 自分が主催するイベントのみ（ADMINは全て可）
    if (event.organizerId !== req.session.userId && req.session.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: You can only view your own events' });
      return;
    }

    // 開催時間外は位置を一切返さない（悪用防止の要）
    if (!isWithinEventWindow(event)) {
      res.json({ active: false, positions: [] });
      return;
    }

    const eventMap = positionStore.get(eventId);
    const now = Date.now();
    const positions = eventMap
      ? Array.from(eventMap.values())
          .filter((p) => now - p.updatedAt <= OFFLINE_MS)
          .map((p) => ({
            participantName: p.participantName,
            vehicle: p.vehicle,
            lat: p.lat,
            lng: p.lng,
            accuracy: p.accuracy,
            secondsAgo: Math.round((now - p.updatedAt) / 1000),
          }))
      : [];

    res.json({ active: true, positions });
  } catch (error) {
    console.error('Get positions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
