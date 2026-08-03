// サーキット詳細ページ

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
  LocationOn,
  Speed,
  Terrain,
  DirectionsCar,
  Public,
  Info,
} from '@mui/icons-material';
import { getCircuit } from '../api/circuits';
import type { Circuit } from '../types';

export default function CircuitDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [circuit, setCircuit] = useState<Circuit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setError('サーキット情報の取得に失敗しました');
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
          読み込み中...
        </Typography>
      </Container>
    );
  }

  if (error || !circuit) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || 'サーキットが見つかりません'}
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
            {circuit.name}
          </Typography>
          <Chip
            label={circuit.isPublic ? '公開' : '非公開'}
            color={circuit.isPublic ? 'success' : 'default'}
          />
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* 基本情報 */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              基本情報
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <LocationOn sx={{ mr: 1, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  所在地
                </Typography>
                <Typography variant="h6">
                  {circuit.country} {circuit.state && `/ ${circuit.state}`}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                コースタイプ
              </Typography>
              <Chip label={circuit.courseType} color="primary" size="small" />
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                対応スポーツ
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {circuit.sportCategories && circuit.sportCategories.length > 0 ? (
                  circuit.sportCategories.map((sport) => (
                    <Chip key={sport} label={sport} size="small" variant="outlined" />
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    未設定
                  </Typography>
                )}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Public sx={{ mr: 1, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  公開設定
                </Typography>
                <Typography variant="body1">
                  {circuit.isPublic ? '公開コース' : '非公開コース'}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* コース仕様 */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              コース仕様
            </Typography>
            <Divider sx={{ mb: 2 }} />

            {(circuit.referenceTime || circuit.referenceLapTime) && (
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Speed sx={{ mr: 1, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    基準ラップタイム
                  </Typography>
                  <Typography variant="h6">
                    {((circuit.referenceTime || circuit.referenceLapTime) / 1000).toFixed(3)}秒
                  </Typography>
                </Box>
              </Box>
            )}

            {circuit.courseLength && (
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <DirectionsCar sx={{ mr: 1, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    コース長
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
                    高低差
                  </Typography>
                  <Typography variant="body1">
                    {circuit.elevationGain} m
                  </Typography>
                </Box>
              </Box>
            )}

            {!circuit.referenceTime && !circuit.courseLength && !circuit.elevationGain && (
              <Typography variant="body2" color="text.secondary">
                コース仕様情報が登録されていません
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* コントロールライン座標 */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              コントロールライン座標
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                地点A
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                緯度: {circuit.controlLineA.lat.toFixed(7)}
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                経度: {circuit.controlLineA.lng.toFixed(7)}
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                地点B
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                緯度: {circuit.controlLineB.lat.toFixed(7)}
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                経度: {circuit.controlLineB.lng.toFixed(7)}
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
                  説明
                </Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="body1">
                {circuit.description}
              </Typography>
            </Paper>
          </Grid>
        )}

        {/* 操作ボタン */}
        <Grid size={12}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              編集・削除機能は準備中です
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2 }}>
              <Button variant="outlined" disabled>
                サーキットを編集
              </Button>
              <Button variant="outlined" color="error" disabled>
                サーキットを削除
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
