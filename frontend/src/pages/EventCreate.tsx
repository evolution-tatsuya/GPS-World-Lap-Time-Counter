// イベント作成ページ

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const { user } = useAuthStore();

  const [name, setName] = useState('');
  const [courseId, setCourseId] = useState('');
  const [sportCategory, setSportCategory] = useState<'CAR' | 'MOTORCYCLE' | 'RUNNING' | 'BICYCLE'>('CAR');
  const [eventDate, setEventDate] = useState('');
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
      const response = await apiClient.post('/events', {
        name,
        courseId,
        sportCategory,
        eventDate,
        maxParticipants: maxParticipants || null,
        isPublic,
      });

      navigate(`/events/${response.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'イベントの作成に失敗しました');
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
        ダッシュボードに戻る
      </Button>

      <Paper sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <EventIcon sx={{ mr: 1, fontSize: 32 }} />
          <Typography variant="h4" component="h1">
            新規イベント作成
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="イベント名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            sx={{ mb: 2 }}
            placeholder="例: Suzuka Test Session 2026"
          />

          <TextField
            fullWidth
            select
            label="コース"
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
            label="スポーツカテゴリ"
            value={sportCategory}
            onChange={(e) => setSportCategory(e.target.value as any)}
            required
            sx={{ mb: 2 }}
          >
            <MenuItem value="CAR">自動車</MenuItem>
            <MenuItem value="MOTORCYCLE">オートバイ</MenuItem>
            <MenuItem value="RUNNING">ランニング</MenuItem>
            <MenuItem value="BICYCLE">自転車</MenuItem>
          </TextField>

          <TextField
            fullWidth
            type="datetime-local"
            label="開催日時"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            required
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            fullWidth
            type="number"
            label="最大参加者数（任意）"
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(e.target.value ? parseInt(e.target.value) : '')}
            sx={{ mb: 2 }}
            placeholder="未入力の場合は無制限"
          />

          <FormControlLabel
            control={
              <Switch
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
            }
            label="公開イベント"
            sx={{ mb: 3 }}
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading || !name || !courseId || !eventDate}
              fullWidth
            >
              {loading ? '作成中...' : 'イベントを作成'}
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={() => navigate('/dashboard')}
              disabled={loading}
            >
              キャンセル
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}
