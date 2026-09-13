// 車載映像 WebRTC P2P シグナリング API
//
// 設計（位置共有 positions.ts と同じ思想）:
// - SDP(offer/answer)・ICE候補は「メモリ上」にのみ保持。DBには残さない。
// - ドライバー(publisher)→運営(viewer)の1対1の握手だけを仲介する。
//   映像本体はP2Pで直接流れるため、このサーバーは軽量な握手情報しか扱わない。
// - イベント開催時間内のみ。運営は自分のイベントのみ。
// - サーバー再起動でメモリ上の握手情報は全消去される（一時的なもの）。
// - ポーリングで交換する（電波の弱い環境でも確実に届くGET/POST方式）。

import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { requireSession, requireOrganizer } from '../middleware/auth';
import { isWithinEventWindow } from '../utils/eventWindow';

const router = Router();

// 1参加者(=1配信)の握手情報。
interface SignalSlot {
  participantName: string;
  vehicle: string | null;
  zekken: string | null;
  offer: string | null;                 // publisher(ドライバー)が置くSDP offer(JSON文字列)
  answer: string | null;                // viewer(運営)が置くSDP answer(JSON文字列)
  pubCandidates: string[];              // publisher発のICE候補
  subCandidates: string[];              // viewer発のICE候補
  offerAt: number;                      // offer更新時刻。古い握手の掃除に使う。
  updatedAt: number;
}

// eventId -> (participantKey -> SignalSlot)
const store = new Map<string, Map<string, SignalSlot>>();

// この時間offerが更新されなければ配信終了とみなし掃除する（30秒）。
const STALE_MS = 30 * 1000;

function eventMap(eventId: string): Map<string, SignalSlot> {
  let m = store.get(eventId);
  if (!m) { m = new Map(); store.set(eventId, m); }
  return m;
}

// 古いスロットを掃除する。
function sweep(m: Map<string, SignalSlot>) {
  const now = Date.now();
  for (const [k, v] of m) {
    if (now - v.offerAt > STALE_MS) m.delete(k);
  }
}

// ========== 配信者(ドライバー): offer を置く / answer と viewer ICE を受け取る ==========

/**
 * POST /api/signaling/offer
 * body: { offer: string(SDP JSON), candidates?: string[] }
 * ドライバーが自分の配信offerとICE候補を置く。新しいofferで握手をリセットする。
 */
router.post('/offer', requireSession, async (req: Request, res: Response) => {
  try {
    const eventId = req.session.eventId;
    const participantName = req.session.driverName;
    if (!eventId || !participantName) {
      res.status(403).json({ error: 'Participant session is required' });
      return;
    }
    const { offer } = req.body as { offer?: string };
    if (typeof offer !== 'string' || !offer) {
      res.status(400).json({ error: 'offer is required' });
      return;
    }
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, startAt: true, endAt: true, eventDate: true },
    });
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    if (!isWithinEventWindow(event)) {
      eventMap(eventId).delete(req.session.userId || participantName);
      res.status(403).json({ error: 'Event is not currently active' });
      return;
    }

    const m = eventMap(eventId);
    const key = req.session.userId || participantName;
    // 新しいofferで握手を作り直す（answer/ICEはクリア）。
    m.set(key, {
      participantName,
      vehicle: req.session.vehicle || null,
      zekken: req.session.zekken || null,
      offer,
      answer: null,
      pubCandidates: [],
      subCandidates: [],
      offerAt: Date.now(),
      updatedAt: Date.now(),
    });
    res.json({ success: true, key });
  } catch (error) {
    console.error('Signaling offer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/signaling/pub-ice   body: { candidate: string }
 * 配信者がICE候補を追加する。
 */
router.post('/pub-ice', requireSession, (req: Request, res: Response) => {
  const eventId = req.session.eventId;
  const participantName = req.session.driverName;
  if (!eventId || !participantName) { res.status(403).json({ error: 'Participant session is required' }); return; }
  const { candidate } = req.body as { candidate?: string };
  if (typeof candidate !== 'string') { res.status(400).json({ error: 'candidate is required' }); return; }
  const slot = eventMap(eventId).get(req.session.userId || participantName);
  if (slot) { slot.pubCandidates.push(candidate); slot.updatedAt = Date.now(); }
  res.json({ success: true });
});

/**
 * GET /api/signaling/pub-poll
 * 配信者が「viewerのanswer」と「viewerのICE候補」を取得する。
 */
router.get('/pub-poll', requireSession, (req: Request, res: Response) => {
  const eventId = req.session.eventId;
  const participantName = req.session.driverName;
  if (!eventId || !participantName) { res.status(403).json({ error: 'Participant session is required' }); return; }
  const slot = eventMap(eventId).get(req.session.userId || participantName);
  if (!slot) { res.json({ answer: null, candidates: [] }); return; }
  slot.offerAt = Date.now(); // 生存更新（掃除されないように）
  res.json({ answer: slot.answer, candidates: slot.subCandidates });
});

// ========== 視聴者(運営): 配信一覧 / offer取得 / answer登録 ==========

/**
 * GET /api/signaling/:eventId/list
 * 運営が、今offerを出している配信者(=映像を見られる車)の一覧を取得する。
 */
router.get('/:eventId/list', requireOrganizer, async (req: Request, res: Response) => {
  try {
    const eventId = String(req.params.eventId);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizerId: true, startAt: true, endAt: true, eventDate: true },
    });
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    if (event.organizerId !== req.session.userId) { res.status(403).json({ error: 'Not your event' }); return; }
    const m = eventMap(eventId);
    sweep(m);
    const list = Array.from(m.entries()).map(([key, s]) => ({
      key, participantName: s.participantName, vehicle: s.vehicle, zekken: s.zekken,
    }));
    res.json({ active: isWithinEventWindow(event), publishers: list });
  } catch (error) {
    console.error('Signaling list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/signaling/:eventId/offer/:key
 * 運営が、指定した車のoffer と 配信者ICE候補 を取得する。
 */
router.get('/:eventId/offer/:key', requireOrganizer, async (req: Request, res: Response) => {
  try {
    const eventId = String(req.params.eventId);
    const key = String(req.params.key);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizerId: true },
    });
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    if (event.organizerId !== req.session.userId) { res.status(403).json({ error: 'Not your event' }); return; }
    const slot = eventMap(eventId).get(key);
    if (!slot) { res.json({ offer: null, candidates: [] }); return; }
    res.json({ offer: slot.offer, candidates: slot.pubCandidates });
  } catch (error) {
    console.error('Signaling get offer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/signaling/:eventId/answer/:key   body: { answer: string, candidate?: string }
 * 運営が answer と自分のICE候補を登録する（candidateのみの追記も可）。
 */
router.post('/:eventId/answer/:key', requireOrganizer, async (req: Request, res: Response) => {
  try {
    const eventId = String(req.params.eventId);
    const key = String(req.params.key);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizerId: true },
    });
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    if (event.organizerId !== req.session.userId) { res.status(403).json({ error: 'Not your event' }); return; }
    const slot = eventMap(eventId).get(key);
    if (!slot) { res.status(404).json({ error: 'Publisher not found' }); return; }
    const { answer, candidate } = req.body as { answer?: string; candidate?: string };
    if (typeof answer === 'string' && answer) slot.answer = answer;
    if (typeof candidate === 'string') slot.subCandidates.push(candidate);
    slot.updatedAt = Date.now();
    res.json({ success: true });
  } catch (error) {
    console.error('Signaling answer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
