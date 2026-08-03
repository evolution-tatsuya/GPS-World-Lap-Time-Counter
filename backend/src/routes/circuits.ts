// サーキットAPI ルート

import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { requireOrganizer } from '../middleware/auth';
import { CircuitCreateInput } from '../types';
import { formatCourseLines } from '../utils/formatCourse';

const router = Router();

// ========== サーキット一覧取得 ==========

/**
 * GET /api/circuits
 * サーキット一覧を取得（国・都道府県フィルタ対応）
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const country = typeof req.query.country === 'string' ? req.query.country : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;

    const circuits = await prisma.course.findMany({
      where: {
        ...(country && { country }),
        ...(state && { state }),
        isPublic: true
      },
      orderBy: { name: 'asc' }
    });

    // Decimal型をnumberに変換
    const formattedCircuits = circuits.map((circuit) => ({
      id: circuit.id,
      country: circuit.country,
      state: circuit.state,
      name: circuit.name,
      type: circuit.courseType,
      ...formatCourseLines(circuit),
      referenceLapTime: circuit.referenceTime,
      description: circuit.description,
      isPublic: circuit.isPublic,
      createdAt: circuit.createdAt,
      updatedAt: circuit.updatedAt
    }));

    res.json(formattedCircuits);
  } catch (error) {
    console.error('Get circuits error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== サーキット詳細取得 ==========

/**
 * GET /api/circuits/:id
 * 特定のサーキット情報を取得
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const circuit = await prisma.course.findUnique({
      where: { id }
    });

    if (!circuit) {
      res.status(404).json({ error: 'Circuit not found' });
      return;
    }

    res.json({
      id: circuit.id,
      country: circuit.country,
      state: circuit.state,
      name: circuit.name,
      type: circuit.courseType,
      ...formatCourseLines(circuit),
      referenceLapTime: circuit.referenceTime,
      description: circuit.description,
      isPublic: circuit.isPublic,
      createdAt: circuit.createdAt,
      updatedAt: circuit.updatedAt
    });
  } catch (error) {
    console.error('Get circuit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== サーキット新規登録 ==========

/**
 * POST /api/circuits
 * 新規サーキットを登録（運営者のみ）
 */
router.post('/', requireOrganizer, async (req: Request, res: Response) => {
  try {
    const {
      country,
      state,
      name,
      type,
      courseType,
      controlLineA,
      controlLineB,
      measureType,
      goalLineA,
      goalLineB,
      referenceLapTime,
      referenceTime,
      description,
      isPublic
    } = req.body as any; // 後方互換性のため両方のフィールド名を受け入れる

    // バリデーション
    if (!country || !name || !controlLineA || !controlLineB) {
      res.status(400).json({ error: 'Required fields are missing' });
      return;
    }

    // 重複チェック
    const existing = await prisma.course.findFirst({
      where: {
        country,
        state: state || null,
        name
      }
    });

    if (existing) {
      res.status(409).json({ error: 'Circuit already exists with this name in this location' });
      return;
    }

    // コース作成（後方互換性のため両方のフィールド名をサポート）
    const circuit = await prisma.course.create({
      data: {
        country,
        state: state || null,
        name,
        courseType: courseType || type || 'CLOSED_CIRCUIT',
        sportCategories: ['CAR'], // デフォルトで車をサポート
        controlLineALat: controlLineA.lat,
        controlLineALng: controlLineA.lng,
        controlLineBLat: controlLineB.lat,
        controlLineBLng: controlLineB.lng,
        // 片道モード（ONE_WAY）のときはゴールラインも保存
        measureType: measureType === 'ONE_WAY' ? 'ONE_WAY' : 'LAP',
        goalLineALat: goalLineA?.lat ?? null,
        goalLineALng: goalLineA?.lng ?? null,
        goalLineBLat: goalLineB?.lat ?? null,
        goalLineBLng: goalLineB?.lng ?? null,
        referenceTime: referenceTime || referenceLapTime || null,
        description: description || null,
        isPublic: isPublic !== undefined ? isPublic : true,
        createdBy: req.session.userId
      }
    });

    res.status(201).json({
      id: circuit.id,
      country: circuit.country,
      state: circuit.state,
      name: circuit.name,
      type: circuit.courseType,
      ...formatCourseLines(circuit),
      referenceLapTime: circuit.referenceTime,
      description: circuit.description,
      isPublic: circuit.isPublic,
      createdAt: circuit.createdAt,
      updatedAt: circuit.updatedAt
    });
  } catch (error) {
    console.error('Create circuit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== サーキット更新 ==========

/**
 * PUT /api/circuits/:id
 * サーキット情報を更新（運営者のみ、自分が作成したもののみ）
 */
router.put('/:id', requireOrganizer, async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updates = req.body;

    // 既存サーキット取得
    const existing = await prisma.course.findUnique({
      where: { id }
    });

    if (!existing) {
      res.status(404).json({ error: 'Circuit not found' });
      return;
    }

    // 権限チェック（作成者またはADMIN）
    if (existing.createdBy !== req.session.userId && req.session.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: You can only update your own circuits' });
      return;
    }

    // 更新データ準備
    const updateData: any = {};
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.referenceLapTime !== undefined) updateData.referenceTime = updates.referenceLapTime;
    if (updates.isPublic !== undefined) updateData.isPublic = updates.isPublic;

    if (updates.controlLineA) {
      updateData.controlLineALat = updates.controlLineA.lat;
      updateData.controlLineALng = updates.controlLineA.lng;
    }
    if (updates.controlLineB) {
      updateData.controlLineBLat = updates.controlLineB.lat;
      updateData.controlLineBLng = updates.controlLineB.lng;
    }

    // 更新実行
    const circuit = await prisma.course.update({
      where: { id },
      data: updateData
    });

    res.json({
      id: circuit.id,
      country: circuit.country,
      state: circuit.state,
      name: circuit.name,
      type: circuit.courseType,
      ...formatCourseLines(circuit),
      referenceLapTime: circuit.referenceTime,
      description: circuit.description,
      isPublic: circuit.isPublic,
      createdAt: circuit.createdAt,
      updatedAt: circuit.updatedAt
    });
  } catch (error) {
    console.error('Update circuit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== サーキット削除 ==========

/**
 * DELETE /api/circuits/:id
 * サーキットを削除（運営者のみ、自分が作成したもののみ）
 */
router.delete('/:id', requireOrganizer, async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    // 既存サーキット取得
    const existing = await prisma.course.findUnique({
      where: { id }
    });

    if (!existing) {
      res.status(404).json({ error: 'Circuit not found' });
      return;
    }

    // 権限チェック
    if (existing.createdBy !== req.session.userId && req.session.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: You can only delete your own circuits' });
      return;
    }

    // イベントで使用されているかチェック
    const eventsCount = await prisma.event.count({
      where: { courseId: id }
    });

    if (eventsCount > 0) {
      res.status(409).json({ error: 'Cannot delete circuit that is used by events' });
      return;
    }

    // 削除実行
    await prisma.course.delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete circuit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
