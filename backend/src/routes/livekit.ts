// LiveKit アクセストークン発行 API
//
// 車載映像をLiveKit(SFU)経由で配信/視聴するためのトークンを発行する。
// - room名 = イベントID（イベントごとに独立した配信空間）
// - ドライバー(participant) = publisher（自分のカメラを配信）
// - 運営(organizer)         = viewer（配信を購読のみ。自分は配信しない）
// - 主催者に車載カメラ機能(cameraEnabled)が許可されている場合のみ発行
// - ドライバーは開催時間内のみ
//
// 環境変数: LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
// （未設定なら503を返す。デプロイ時にSecret/環境変数で注入する）

import { Router, Request, Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { prisma } from '../index';
import { requireSession, requireOrganizer } from '../middleware/auth';
import { isWithinEventWindow } from '../utils/eventWindow';

const router = Router();

function lkConfig() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

// identityに使えない文字を除去し、一意キーを作る
function safeIdentity(s: string): string {
  return s.replace(/[^\w\-]/g, '_').slice(0, 60) || 'anon';
}

// ========== ドライバー: 配信用トークン ==========

/**
 * POST /api/livekit/token/publish
 * 参加者(ドライバー)が自分のカメラを配信するためのトークンを発行する。
 * roomはイベントID。identityは参加者キー。メタデータにゼッケン/名前/車両を載せる。
 */
router.post('/token/publish', requireSession, async (req: Request, res: Response) => {
  try {
    const cfg = lkConfig();
    if (!cfg) { res.status(503).json({ error: 'LiveKit is not configured' }); return; }

    const eventId = req.session.eventId;
    const participantName = req.session.driverName;
    if (!eventId || !participantName) { res.status(403).json({ error: 'Participant session is required' }); return; }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, startAt: true, endAt: true, eventDate: true, organizer: { select: { cameraEnabled: true } } },
    });
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    if (!event.organizer.cameraEnabled) { res.status(403).json({ error: 'Camera feature is disabled' }); return; }
    if (!isWithinEventWindow(event)) { res.status(403).json({ error: 'Event is not currently active' }); return; }

    const identity = safeIdentity(req.session.userId || participantName);
    const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
      identity,
      name: participantName,
      // 表示に使う情報（運営側でparticipant.metadataから読む）
      metadata: JSON.stringify({
        participantName,
        vehicle: req.session.vehicle || null,
        zekken: req.session.zekken || null,
      }),
    });
    at.addGrant({
      room: eventId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: false, // 配信者は他人の映像を受け取らない（帯域節約）
    });

    res.json({ url: cfg.url, token: await at.toJwt(), room: eventId, identity });
  } catch (error) {
    console.error('LiveKit publish token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== 運営: 視聴用トークン ==========

/**
 * POST /api/livekit/token/view/:eventId
 * 主催者が自分のイベントの配信を購読するためのトークンを発行する。
 */
router.post('/token/view/:eventId', requireOrganizer, async (req: Request, res: Response) => {
  try {
    const cfg = lkConfig();
    if (!cfg) { res.status(503).json({ error: 'LiveKit is not configured' }); return; }

    const eventId = String(req.params.eventId);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizerId: true, organizer: { select: { cameraEnabled: true } } },
    });
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    if (event.organizerId !== req.session.userId) { res.status(403).json({ error: 'Not your event' }); return; }
    if (!event.organizer.cameraEnabled) { res.status(403).json({ error: 'Camera feature is disabled' }); return; }

    const identity = safeIdentity('viewer_' + (req.session.userId || 'org'));
    const at = new AccessToken(cfg.apiKey, cfg.apiSecret, { identity, name: 'organizer' });
    at.addGrant({
      room: eventId,
      roomJoin: true,
      canPublish: false, // 運営は配信しない（購読のみ）
      canSubscribe: true,
    });

    res.json({ url: cfg.url, token: await at.toJwt(), room: eventId, identity });
  } catch (error) {
    console.error('LiveKit view token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
