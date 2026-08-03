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
  const { t } = useTranslation();
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

        {/* 操作ボタン */}
        <Grid size={12}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('circuitDetail.editDeletePending')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2 }}>
              <Button variant="outlined" disabled>
                {t('circuitDetail.editCircuit')}
              </Button>
              <Button variant="outlined" color="error" disabled>
                {t('circuitDetail.deleteCircuit')}
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
