// イベント詳細ページ

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
} from '@mui/material';
import {
  ArrowBack,
  CalendarToday,
  LocationOn,
  Category,
  Code,
  Public,
  People,
  Download,
  EmojiEvents,
  MyLocation,
} from '@mui/icons-material';
import { getEvent, updateEvent, deleteEvent } from '../api/events';
import { exportEventLapsCsv } from '../api/laps';
import { useAuthStore } from '../stores/authStore';
import type { EventWithCourse, EventUpdateInput } from '../types';

// ISO文字列 ⇄ datetime-localの値（YYYY-MM-DDTHH:mm, ローカルタイム）の相互変換
function isoToLocalInput(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // ローカルタイムの各要素でYYYY-MM-DDTHH:mmを組み立てる
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local); // datetime-localはローカルタイムとして解釈される
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
// 開催日(date入力 YYYY-MM-DD)の相互変換
function isoToDateInput(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [event, setEvent] = useState<EventWithCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { isOrganizer } = useAuthStore();

  // 編集ダイアログ
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', eventDate: '', startAt: '', endAt: '', maxParticipants: '' });

  // 削除確認ダイアログ
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openEdit = () => {
    if (!event) return;
    setForm({
      name: event.name,
      eventDate: isoToDateInput(event.eventDate),
      startAt: isoToLocalInput(event.startAt),
      endAt: isoToLocalInput(event.endAt),
      maxParticipants: event.maxParticipants != null ? String(event.maxParticipants) : '',
    });
    setEditError(null);
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!id) return;
    if (!form.name.trim()) { setEditError(t('eventDetail.nameRequired', 'イベント名を入力してください')); return; }
    if (form.startAt && form.endAt && new Date(form.startAt).getTime() >= new Date(form.endAt).getTime()) {
      setEditError(t('eventDetail.timeOrderError', '終了時刻は開始時刻より後にしてください'));
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const payload: EventUpdateInput = {
        name: form.name.trim(),
        eventDate: form.eventDate ? new Date(form.eventDate).toISOString() : undefined,
        startAt: form.startAt ? localInputToIso(form.startAt) : null,
        endAt: form.endAt ? localInputToIso(form.endAt) : null,
        maxParticipants: form.maxParticipants.trim() === '' ? null : Number(form.maxParticipants),
      };
      const updated = await updateEvent(id, payload);
      setEvent({ ...(event as EventWithCourse), ...updated } as EventWithCourse);
      setEditOpen(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t('eventDetail.saveFailed', '保存に失敗しました'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteEvent(id);
      navigate('/dashboard');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('eventDetail.deleteFailed', '削除に失敗しました'));
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    if (!id) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportEventLapsCsv(id);
    } catch (err) {
      console.error('Failed to export CSV:', err);
      setExportError(err instanceof Error ? err.message : t('eventDetail.csvExportFailed'));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!id) return;

    const fetchEvent = async () => {
      try {
        setLoading(true);
        const data = await getEvent(id) as EventWithCourse;
        setEvent(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch event:', err);
        setError(t('eventDetail.fetchFailed'));
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [id]);

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="body1" sx={{ mt: 2 }}>
          {t('eventDetail.loading')}
        </Typography>
      </Container>
    );
  }

  if (error || !event) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || t('eventDetail.notFound')}
        </Alert>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate('/dashboard')}
        >
          {t('eventDetail.backToDashboard')}
        </Button>
      </Container>
    );
  }

  const course = event.course || event.circuit;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* ヘッダー */}
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate('/dashboard')}
          sx={{ mb: 2 }}
        >
          {t('eventDetail.backToDashboard')}
        </Button>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="h4" component="h1">
            {event.name}
          </Typography>
          <Chip
            label={event.isPublic ? t('eventDetail.public') : t('eventDetail.private')}
            color={event.isPublic ? 'success' : 'default'}
          />
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* イベント基本情報 */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('eventDetail.eventInfo')}
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Code sx={{ mr: 1, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {t('eventDetail.eventCode')}
                </Typography>
                <Typography variant="h6">
                  {event.eventCode}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <CalendarToday sx={{ mr: 1, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {t('eventDetail.eventDateTime')}
                </Typography>
                <Typography variant="body1">
                  {new Date(event.eventDate).toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short'
                  })}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Category sx={{ mr: 1, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {t('eventDetail.sportCategory')}
                </Typography>
                <Chip label={event.sportCategory} color="primary" size="small" />
              </Box>
            </Box>

            {event.maxParticipants && (
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <People sx={{ mr: 1, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    {t('eventDetail.maxParticipants')}
                  </Typography>
                  <Typography variant="body1">
                    {t('eventDetail.participantsSuffix', { count: event.maxParticipants })}
                  </Typography>
                </Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Public sx={{ mr: 1, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {t('eventDetail.publicSetting')}
                </Typography>
                <Typography variant="body1">
                  {event.isPublic ? t('eventDetail.publicEvent') : t('eventDetail.privateEvent')}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* コース情報 */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('eventDetail.courseInfo')}
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {t('eventDetail.courseName')}
              </Typography>
              <Typography variant="h6">
                {course.name}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <LocationOn sx={{ mr: 1, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {t('eventDetail.location')}
                </Typography>
                <Typography variant="body1">
                  {course.country} {course.state && `/ ${course.state}`}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {t('eventDetail.courseType')}
              </Typography>
              <Chip label={course.courseType} size="small" />
            </Box>

            {(course.referenceTime || course.referenceLapTime) && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {t('eventDetail.referenceLapTime')}
                </Typography>
                <Typography variant="body1">
                  {t('eventDetail.secondsSuffix', { seconds: ((course.referenceTime || course.referenceLapTime || 0) / 1000).toFixed(3) })}
                </Typography>
              </Box>
            )}

            {course.courseLength && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {t('eventDetail.courseLength')}
                </Typography>
                <Typography variant="body1">
                  {course.courseLength} km
                </Typography>
              </Box>
            )}

            {course.description && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {t('eventDetail.description')}
                </Typography>
                <Typography variant="body1">
                  {course.description}
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* 結果・集計 */}
        <Grid size={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              {t('eventDetail.results')}
            </Typography>
            {exportError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {exportError}
              </Alert>
            )}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<EmojiEvents />}
                onClick={() => navigate('/ranking')}
              >
                {t('eventDetail.viewRanking')}
              </Button>
              <Button
                variant="outlined"
                startIcon={exporting ? <CircularProgress size={18} /> : <Download />}
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? t('eventDetail.exporting') : t('eventDetail.exportCsv')}
              </Button>
              <Button
                variant="outlined"
                startIcon={<MyLocation />}
                onClick={() => navigate(`/events/${id}/live-map`)}
              >
                {t('eventDetail.viewLiveMap')}
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={() => navigate(`/events/${id}/monitor`)}
              >
                {t('monitor.openMonitor')}
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* 操作ボタン（運営ログイン時のみ。自分のイベント以外はサーバーが403で弾く） */}
        {isOrganizer() && (
          <Grid size={12}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                <Button variant="outlined" onClick={openEdit}>
                  {t('eventDetail.editEvent')}
                </Button>
                <Button variant="outlined" color="error" onClick={() => { setDeleteError(null); setDeleteOpen(true); }}>
                  {t('eventDetail.deleteEvent')}
                </Button>
              </Box>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* 編集ダイアログ */}
      <Dialog open={editOpen} onClose={() => !saving && setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('eventDetail.editEvent')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {editError && <Alert severity="error">{editError}</Alert>}
            <TextField
              label={t('eventDetail.eventName', 'イベント名')}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
            />
            <TextField
              label={t('eventDetail.eventDate', '開催日')}
              type="date"
              value={form.eventDate}
              onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label={t('eventDetail.startAt', '開始時刻')}
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label={t('eventDetail.endAt', '終了時刻')}
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label={t('eventDetail.maxParticipants', '参加者上限（任意）')}
              type="number"
              value={form.maxParticipants}
              onChange={(e) => setForm((f) => ({ ...f, maxParticipants: e.target.value }))}
              fullWidth
              slotProps={{ htmlInput: { min: 1 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={saving}>{t('common.cancel', 'キャンセル')}</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {saving ? <CircularProgress size={20} /> : t('common.save', '保存')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('eventDetail.deleteEvent')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {deleteError && <Alert severity="error">{deleteError}</Alert>}
            <Typography variant="body2">
              {t('eventDetail.deleteConfirm', 'このイベントを削除しますか？記録されたラップも削除され、元に戻せません。')}
            </Typography>
            {event && <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{event.name}</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>{t('common.cancel', 'キャンセル')}</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? <CircularProgress size={20} /> : t('eventDetail.deleteEvent')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
