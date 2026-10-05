// サーキット詳細ページ

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  FormControlLabel,
  Switch,
} from '@mui/material';
import {
  ArrowBack,
  LocationOn,
  Speed,
  Terrain,
  DirectionsCar,
  Public,
  Info,
} from '@mui/icons-material';
import { getCircuit, updateCircuit, deleteCircuit } from '../api/circuits';
import { useAuthStore } from '../stores/authStore';
import type { Circuit, CircuitUpdateInput } from '../types';

export default function CircuitDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [circuit, setCircuit] = useState<Circuit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isOrganizer } = useAuthStore();

  // 編集ダイアログ
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', courseLength: '', elevationGain: '', referenceSec: '', isPublic: true });

  // 削除確認
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openEdit = () => {
    if (!circuit) return;
    const refMs = circuit.referenceTime ?? circuit.referenceLapTime ?? null;
    setForm({
      name: circuit.name,
      description: circuit.description ?? '',
      courseLength: circuit.courseLength != null ? String(circuit.courseLength) : '',
      elevationGain: circuit.elevationGain != null ? String(circuit.elevationGain) : '',
      referenceSec: refMs != null ? String(refMs / 1000) : '',
      isPublic: circuit.isPublic,
    });
    setEditError(null);
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!id) return;
    if (!form.name.trim()) { setEditError('コース名を入力してください'); return; }
    setSaving(true);
    setEditError(null);
    try {
      const payload: CircuitUpdateInput = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        courseLength: form.courseLength.trim() === '' ? undefined : Number(form.courseLength),
        elevationGain: form.elevationGain.trim() === '' ? undefined : Number(form.elevationGain),
        referenceTime: form.referenceSec.trim() === '' ? undefined : Math.round(Number(form.referenceSec) * 1000),
        isPublic: form.isPublic,
      };
      await updateCircuit(id, payload);
      // レスポンス形の差異に影響されないよう、保存後に再取得して表示を最新化
      const fresh = await getCircuit(id);
      setCircuit(fresh);
      setEditOpen(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCircuit(id);
      navigate('/dashboard');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '削除に失敗しました');
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!id) return;

    const fetchCircuit = async () => {
      try {
        setLoading(true);
        const data = await getCircuit(id);
        setCircuit(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch circuit:', err);
        setError(t('circuitDetail.fetchFailed'));
      } finally {
        setLoading(false);
      }
    };

    fetchCircuit();
  }, [id]);

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="body1" sx={{ mt: 2 }}>
          {t('circuitDetail.loading')}
        </Typography>
      </Container>
    );
  }

  if (error || !circuit) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || t('circuitDetail.notFound')}
        </Alert>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate('/dashboard')}
        >
          {t('circuitDetail.backToDashboard')}
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* ヘッダー */}
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate('/dashboard')}
          sx={{ mb: 2 }}
        >
          {t('circuitDetail.backToDashboard')}
        </Button>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="h4" component="h1">
            {circuit.name}
          </Typography>
          <Chip
            label={circuit.isPublic ? t('circuitDetail.public') : t('circuitDetail.private')}
            color={circuit.isPublic ? 'success' : 'default'}
          />
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* 基本情報 */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('circuitDetail.basicInfo')}
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <LocationOn sx={{ mr: 1, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {t('circuitDetail.location')}
                </Typography>
                <Typography variant="h6">
                  {circuit.country} {circuit.state && `/ ${circuit.state}`}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {t('circuitDetail.courseType')}
              </Typography>
              <Chip label={circuit.courseType} color="primary" size="small" />
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {t('circuitDetail.supportedSports')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {circuit.sportCategories && circuit.sportCategories.length > 0 ? (
                  circuit.sportCategories.map((sport) => (
                    <Chip key={sport} label={sport} size="small" variant="outlined" />
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {t('circuitDetail.unset')}
                  </Typography>
                )}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Public sx={{ mr: 1, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {t('circuitDetail.publicSetting')}
                </Typography>
                <Typography variant="body1">
                  {circuit.isPublic ? t('circuitDetail.publicCourse') : t('circuitDetail.privateCourse')}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* コース仕様 */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('circuitDetail.courseSpec')}
            </Typography>
            <Divider sx={{ mb: 2 }} />

            {(circuit.referenceTime || circuit.referenceLapTime) && (
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Speed sx={{ mr: 1, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    {t('circuitDetail.referenceLapTime')}
                  </Typography>
                  <Typography variant="h6">
                    {t('circuitDetail.secondsSuffix', { seconds: ((circuit.referenceTime || circuit.referenceLapTime || 0) / 1000).toFixed(3) })}
                  </Typography>
                </Box>
              </Box>
            )}

            {circuit.courseLength && (
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <DirectionsCar sx={{ mr: 1, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    {t('circuitDetail.courseLength')}
                  </Typography>
                  <Typography variant="body1">
                    {circuit.courseLength} km
                  </Typography>
                </Box>
              </Box>
            )}

            {circuit.elevationGain && (
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Terrain sx={{ mr: 1, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    {t('circuitDetail.elevationGain')}
                  </Typography>
                  <Typography variant="body1">
                    {circuit.elevationGain} m
                  </Typography>
                </Box>
              </Box>
            )}

            {!circuit.referenceTime && !circuit.courseLength && !circuit.elevationGain && (
              <Typography variant="body2" color="text.secondary">
                {t('circuitDetail.noSpec')}
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* コントロールライン座標 */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('circuitDetail.controlLineCoords')}
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {t('circuitDetail.pointA')}
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                {t('circuitDetail.latitude')}: {circuit.controlLineA.lat.toFixed(7)}
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                {t('circuitDetail.longitude')}: {circuit.controlLineA.lng.toFixed(7)}
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {t('circuitDetail.pointB')}
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                {t('circuitDetail.latitude')}: {circuit.controlLineB.lat.toFixed(7)}
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                {t('circuitDetail.longitude')}: {circuit.controlLineB.lng.toFixed(7)}
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* 説明 */}
        {circuit.description && (
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Info sx={{ mr: 1 }} />
                <Typography variant="h6">
                  {t('circuitDetail.description')}
                </Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="body1">
                {circuit.description}
              </Typography>
            </Paper>
          </Grid>
        )}

        {/* 操作ボタン（運営ログイン時のみ。自分のコース以外はサーバーが403で弾く） */}
        {isOrganizer() && (
          <Grid size={12}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                <Button variant="outlined" onClick={openEdit}>
                  {t('circuitDetail.editCircuit')}
                </Button>
                <Button variant="outlined" color="error" onClick={() => { setDeleteError(null); setDeleteOpen(true); }}>
                  {t('circuitDetail.deleteCircuit')}
                </Button>
              </Box>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* 編集ダイアログ */}
      <Dialog open={editOpen} onClose={() => !saving && setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('circuitDetail.editCircuit')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {editError && <Alert severity="error">{editError}</Alert>}
            <TextField label="コース名" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} fullWidth />
            <TextField label="説明" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} fullWidth multiline minRows={2} />
            <TextField label="コース長（km）" type="number" value={form.courseLength} onChange={(e) => setForm((f) => ({ ...f, courseLength: e.target.value }))} fullWidth />
            <TextField label="高低差（m）" type="number" value={form.elevationGain} onChange={(e) => setForm((f) => ({ ...f, elevationGain: e.target.value }))} fullWidth />
            <TextField label="基準ラップタイム（秒）" type="number" value={form.referenceSec} onChange={(e) => setForm((f) => ({ ...f, referenceSec: e.target.value }))} fullWidth helperText="誤検知防止用の最速想定タイム" />
            <FormControlLabel control={<Switch checked={form.isPublic} onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))} />} label="他の運営も使えるよう公開する" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={saving}>キャンセル</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {saving ? <CircularProgress size={20} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('circuitDetail.deleteCircuit')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {deleteError && <Alert severity="error">{deleteError}</Alert>}
            <Typography variant="body2">
              このコースを削除しますか？イベントで使用中のコースは削除できません。
            </Typography>
            {circuit && <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{circuit.name}</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>キャンセル</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? <CircularProgress size={20} /> : t('circuitDetail.deleteCircuit')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
