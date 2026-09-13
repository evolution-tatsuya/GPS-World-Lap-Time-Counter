// イベント作成ページ

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  MenuItem,
  Alert,
  FormControlLabel,
  Switch,
} from '@mui/material';
import { ArrowBack, Event as EventIcon } from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { apiClient } from '../api/client';
import type { Course } from '../types';

export default function EventCreate() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuthStore();

  // イベント名は uncontrolled（value を渡さず defaultValue + ref）にする。
  // iOS Safari では controlled input に再レンダーが挟まるとカーソルが末尾へ飛び、
  // 「打ちながら削除できない／文字が累積する」不具合が出るため、DOM に値を保持させる。
  const nameRef = useRef<HTMLInputElement>(null);
  // 送信ボタンの活性判定用に、名前が空かどうかだけを軽く追跡する（値そのものは持たない）。
  const [nameEmpty, setNameEmpty] = useState(true);
  const [courseId, setCourseId] = useState('');
  const [sportCategory, setSportCategory] = useState<'CAR' | 'MOTORCYCLE' | 'RUNNING' | 'BICYCLE'>('CAR');
  const [eventDate, setEventDate] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [maxParticipants, setMaxParticipants] = useState<number | ''>('');
  const [isPublic, setIsPublic] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // コース一覧取得
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const data = await apiClient.get<Course[]>('/circuits');
        setCourses(data);
      } catch (err) {
        console.error('Failed to fetch courses:', err);
      }
    };

    if (user) {
      fetchCourses();
    } else {
      navigate('/login');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 開催時間帯（任意）。ローカル時刻の datetime-local を ISO に変換して送る。
      const startAtIso = startAt ? new Date(startAt).toISOString() : undefined;
      const endAtIso = endAt ? new Date(endAt).toISOString() : undefined;

      const response = await apiClient.post<{ id: string }>('/events', {
        name: nameRef.current?.value.trim() ?? '',
        courseId,
        sportCategory,
        eventDate,
        startAt: startAtIso,
        endAt: endAtIso,
        maxParticipants: maxParticipants || null,
        isPublic,
      });

      navigate(`/events/${response.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('eventCreate.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Button
        startIcon={<ArrowBack />}
        onClick={() => navigate('/dashboard')}
        sx={{ mb: 2 }}
      >
        {t('eventCreate.backToDashboard')}
      </Button>

      <Paper sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <EventIcon sx={{ mr: 1, fontSize: 32 }} />
          <Typography variant="h4" component="h1">
            {t('eventCreate.title')}
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label={t('eventCreate.eventName')}
            inputRef={nameRef}
            defaultValue=""
            onChange={(e) => setNameEmpty(e.target.value.trim() === '')}
            required
            sx={{ mb: 2 }}
            placeholder="例: Suzuka Test Session 2026"
            // iOS Safariの英字入力で自動大文字化/自動修正が文字を差し替え、
            // 「打ちながら削除できない/累積する」不具合になるため無効化する。
            autoComplete="off"
            slotProps={{
              htmlInput: {
                autoCapitalize: 'none',
                autoCorrect: 'off',
                spellCheck: false,
              },
            }}
          />

          <TextField
            fullWidth
            select
            label={t('eventCreate.course')}
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            required
            sx={{ mb: 2 }}
          >
            {courses.map((course) => (
              <MenuItem key={course.id} value={course.id}>
                {course.name} ({course.country})
              </MenuItem>
            ))}
          </TextField>

          <TextField
            fullWidth
            select
            label={t('eventCreate.sportCategory')}
            value={sportCategory}
            onChange={(e) => setSportCategory(e.target.value as any)}
            required
            sx={{ mb: 2 }}
          >
            <MenuItem value="CAR">{t('eventCreate.car')}</MenuItem>
            <MenuItem value="MOTORCYCLE">{t('eventCreate.motorcycle')}</MenuItem>
            <MenuItem value="RUNNING">{t('eventCreate.running')}</MenuItem>
            <MenuItem value="BICYCLE">{t('eventCreate.bicycle')}</MenuItem>
          </TextField>

          <TextField
            fullWidth
            type="datetime-local"
            label={t('eventCreate.eventDateTime')}
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            required
            sx={{ mb: 2 }}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          {/* 位置共有の許可時間帯。この時間内のみ主催者は参加者の現在地を見られる。 */}
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('eventCreate.hoursInfo')}
          </Alert>

          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              type="datetime-local"
              label={t('eventCreate.startAt')}
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1, minWidth: 200 }}
            />
            <TextField
              type="datetime-local"
              label={t('eventCreate.endAt')}
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1, minWidth: 200 }}
            />
          </Box>

          <TextField
            fullWidth
            type="number"
            label={t('eventCreate.maxParticipants')}
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(e.target.value ? parseInt(e.target.value) : '')}
            sx={{ mb: 2 }}
            placeholder={t('eventCreate.maxParticipantsPlaceholder')}
          />

          <FormControlLabel
            control={
              <Switch
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
            }
            label={t('eventCreate.publicEvent')}
            sx={{ mb: 3 }}
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading || nameEmpty || !courseId || !eventDate}
              fullWidth
            >
              {loading ? t('eventCreate.creating') : t('eventCreate.create')}
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={() => navigate('/dashboard')}
              disabled={loading}
            >
              {t('eventCreate.cancel')}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}
