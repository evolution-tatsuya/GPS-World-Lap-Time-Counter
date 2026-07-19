// イベント詳細ページ

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { getEvent } from '../api/events';
import { exportEventLapsCsv } from '../api/laps';
import type { EventWithCourse } from '../types';

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventWithCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!id) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportEventLapsCsv(id);
    } catch (err) {
      console.error('Failed to export CSV:', err);
      setExportError(err instanceof Error ? err.message : 'CSVエクスポートに失敗しました');
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
        setError('イベント情報の取得に失敗しました');
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
          読み込み中...
        </Typography>
      </Container>
    );
  }

  if (error || !event) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || 'イベントが見つかりません'}
        </Alert>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate('/dashboard')}
        >
          ダッシュボードに戻る
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
          ダッシュボードに戻る
        </Button>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="h4" component="h1">
            {event.name}
          </Typography>
          <Chip
            label={event.isPublic ? '公開' : '非公開'}
            color={event.isPublic ? 'success' : 'default'}
          />
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* イベント基本情報 */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              イベント情報
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Code sx={{ mr: 1, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  イベントコード
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
                  開催日時
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
                  スポーツカテゴリ
                </Typography>
                <Chip label={event.sportCategory} color="primary" size="small" />
              </Box>
            </Box>

            {event.maxParticipants && (
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <People sx={{ mr: 1, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    最大参加者数
                  </Typography>
                  <Typography variant="body1">
                    {event.maxParticipants}名
                  </Typography>
                </Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Public sx={{ mr: 1, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  公開設定
                </Typography>
                <Typography variant="body1">
                  {event.isPublic ? '公開イベント' : '非公開イベント'}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* コース情報 */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              コース情報
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                コース名
              </Typography>
              <Typography variant="h6">
                {course.name}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <LocationOn sx={{ mr: 1, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  所在地
                </Typography>
                <Typography variant="body1">
                  {course.country} {course.state && `/ ${course.state}`}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                コースタイプ
              </Typography>
              <Chip label={course.courseType} size="small" />
            </Box>

            {(course.referenceTime || course.referenceLapTime) && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  基準ラップタイム
                </Typography>
                <Typography variant="body1">
                  {((course.referenceTime || course.referenceLapTime) / 1000).toFixed(3)}秒
                </Typography>
              </Box>
            )}

            {course.courseLength && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  コース長
                </Typography>
                <Typography variant="body1">
                  {course.courseLength} km
                </Typography>
              </Box>
            )}

            {course.description && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  説明
                </Typography>
                <Typography variant="body1">
                  {course.description}
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* 結果・集計 */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              結果・集計
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
                ランキングを見る
              </Button>
              <Button
                variant="outlined"
                startIcon={exporting ? <CircularProgress size={18} /> : <Download />}
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? '出力中...' : '結果をCSVダウンロード'}
              </Button>
              <Button
                variant="outlined"
                startIcon={<MyLocation />}
                onClick={() => navigate(`/events/${id}/live-map`)}
              >
                参加者の現在地を見る
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* 操作ボタン */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              編集・削除機能は準備中です
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2 }}>
              <Button variant="outlined" disabled>
                イベントを編集
              </Button>
              <Button variant="outlined" color="error" disabled>
                イベントを削除
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
