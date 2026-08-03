// サーキット登録ページ

import { useState } from 'react';
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
  Grid,
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  Chip,
} from '@mui/material';
import { ArrowBack, AddLocationAlt, MyLocation } from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { apiClient } from '../api/client';
import { getCurrentPositionOnce, makeControlLineFromPoint } from '../utils/gpsUtils';

const COURSE_TYPES = ['CLOSED_CIRCUIT', 'PUBLIC_ROAD', 'OFF_ROAD'] as const;

export default function CircuitCreate() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [courseType, setCourseType] = useState<typeof COURSE_TYPES[number]>('CLOSED_CIRCUIT');
  const [sportCategories, setSportCategories] = useState<string[]>(['CAR']);
  const [controlLineALat, setControlLineALat] = useState('');
  const [controlLineALng, setControlLineALng] = useState('');
  const [controlLineBLat, setControlLineBLat] = useState('');
  const [controlLineBLng, setControlLineBLng] = useState('');
  // 計測モード（周回/片道）と片道のゴールライン
  const [measureType, setMeasureType] = useState<'LAP' | 'ONE_WAY'>('LAP');
  const [goalLineALat, setGoalLineALat] = useState('');
  const [goalLineALng, setGoalLineALng] = useState('');
  const [goalLineBLat, setGoalLineBLat] = useState('');
  const [goalLineBLng, setGoalLineBLng] = useState('');
  const [referenceTime, setReferenceTime] = useState<number | ''>('');
  const [courseLength, setCourseLength] = useState('');
  const [elevationGain, setElevationGain] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gpsBusy, setGpsBusy] = useState<null | 'A' | 'B' | 'GA' | 'GB' | 'LINE'>(null);
  const [gpsInfo, setGpsInfo] = useState('');

  if (!user) {
    navigate('/login');
    return null;
  }

  // 現在地でスタートラインA/B・ゴールラインA/Bのいずれかを取得
  const capturePoint = async (point: 'A' | 'B' | 'GA' | 'GB') => {
    setError('');
    setGpsInfo('');
    setGpsBusy(point);
    try {
      const pos = await getCurrentPositionOnce();
      const lat = pos.lat.toFixed(6);
      const lng = pos.lng.toFixed(6);
      if (point === 'A') { setControlLineALat(lat); setControlLineALng(lng); }
      else if (point === 'B') { setControlLineBLat(lat); setControlLineBLng(lng); }
      else if (point === 'GA') { setGoalLineALat(lat); setGoalLineALng(lng); }
      else if (point === 'GB') { setGoalLineBLat(lat); setGoalLineBLng(lng); }
      setGpsInfo(t('circuitCreate.pointACaptured', { point, accuracy: Math.round(pos.accuracy) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('circuitCreate.gpsFailed'));
    } finally {
      setGpsBusy(null);
    }
  };

  // 現在地1点からコントロールラインを自動生成（公道テスト向け）
  const captureLineFromHere = async () => {
    setError('');
    setGpsInfo('');
    setGpsBusy('LINE');
    try {
      const pos = await getCurrentPositionOnce();
      const line = makeControlLineFromPoint(pos.lat, pos.lng, 8);
      setControlLineALat(line.a.lat.toFixed(6));
      setControlLineALng(line.a.lng.toFixed(6));
      setControlLineBLat(line.b.lat.toFixed(6));
      setControlLineBLng(line.b.lng.toFixed(6));
      setGpsInfo(
        t('circuitCreate.lineGenerated', { accuracy: Math.round(pos.accuracy) })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('circuitCreate.gpsFailed'));
    } finally {
      setGpsBusy(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiClient.post<{ id: string }>('/circuits', {
        name,
        country,
        state: state || null,
        courseType,
        sportCategories,
        // バックエンドはネストした {lat, lng} 形式を期待する
        controlLineA: {
          lat: parseFloat(controlLineALat),
          lng: parseFloat(controlLineALng),
        },
        controlLineB: {
          lat: parseFloat(controlLineBLat),
          lng: parseFloat(controlLineBLng),
        },
        // 計測モード。片道(ONE_WAY)のときはゴールラインも送る
        measureType,
        goalLineA: measureType === 'ONE_WAY'
          ? { lat: parseFloat(goalLineALat), lng: parseFloat(goalLineALng) }
          : null,
        goalLineB: measureType === 'ONE_WAY'
          ? { lat: parseFloat(goalLineBLat), lng: parseFloat(goalLineBLng) }
          : null,
        referenceTime: referenceTime ? referenceTime * 1000 : null, // 秒→ミリ秒
        courseLength: courseLength || null,
        elevationGain: elevationGain || null,
        description: description || null,
        isPublic,
      });

      navigate(`/circuits/${response.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('circuitCreate.registerFailed'));
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
        {t('circuitCreate.backToDashboard')}
      </Button>

      <Paper sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <AddLocationAlt sx={{ mr: 1, fontSize: 32 }} />
          <Typography variant="h4" component="h1">
            {t('circuitCreate.title')}
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            {t('circuitCreate.basicInfo')}
          </Typography>

          <TextField
            fullWidth
            label={t('circuitCreate.circuitName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            sx={{ mb: 2 }}
            placeholder="例: Suzuka Circuit"
          />

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={6}>
              <TextField
                fullWidth
                label={t('circuitCreate.country')}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                required
                placeholder="例: Japan"
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                label={t('circuitCreate.state')}
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="例: Mie"
              />
            </Grid>
          </Grid>

          <TextField
            fullWidth
            select
            label={t('circuitCreate.courseType')}
            value={courseType}
            onChange={(e) => setCourseType(e.target.value as any)}
            required
            sx={{ mb: 2 }}
          >
            <MenuItem value="CLOSED_CIRCUIT">{t('circuitCreate.closedCircuit')}</MenuItem>
            <MenuItem value="PUBLIC_ROAD">{t('circuitCreate.publicRoad')}</MenuItem>
            <MenuItem value="OFF_ROAD">{t('circuitCreate.offRoad')}</MenuItem>
          </TextField>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>{t('circuitCreate.supportedSports')}</InputLabel>
            <Select
              multiple
              value={sportCategories}
              onChange={(e) => setSportCategories(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
              input={<OutlinedInput label={t('circuitCreate.supportedSports')} />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value} size="small" />
                  ))}
                </Box>
              )}
            >
              <MenuItem value="CAR">{t('circuitCreate.car')}</MenuItem>
              <MenuItem value="MOTORCYCLE">{t('circuitCreate.motorcycle')}</MenuItem>
              <MenuItem value="RUNNING">{t('circuitCreate.running')}</MenuItem>
              <MenuItem value="BICYCLE">{t('circuitCreate.bicycle')}</MenuItem>
            </Select>
          </FormControl>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            {t('circuitCreate.measureMode')}
          </Typography>
          <TextField
            select
            fullWidth
            label={t('circuitCreate.measureMode')}
            value={measureType}
            onChange={(e) => setMeasureType(e.target.value as 'LAP' | 'ONE_WAY')}
            sx={{ mb: 2 }}
          >
            <MenuItem value="LAP">{t('circuitCreate.lapMode')}</MenuItem>
            <MenuItem value="ONE_WAY">{t('circuitCreate.oneWayMode')}</MenuItem>
          </TextField>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            {measureType === 'ONE_WAY' ? t('circuitCreate.startLineCoords') : t('circuitCreate.controlLineCoords')}
          </Typography>

          <Alert severity="info" sx={{ mb: 2 }}>
            {t('circuitCreate.controlLineInfo')}
          </Alert>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<MyLocation />}
              onClick={captureLineFromHere}
              disabled={gpsBusy !== null}
            >
              {gpsBusy === 'LINE' ? t('circuitCreate.capturing') : t('circuitCreate.autoGenerateLine')}
            </Button>
            <Button
              variant="outlined"
              startIcon={<MyLocation />}
              onClick={() => capturePoint('A')}
              disabled={gpsBusy !== null}
            >
              {gpsBusy === 'A' ? t('circuitCreate.capturing') : t('circuitCreate.capturePointA')}
            </Button>
            <Button
              variant="outlined"
              startIcon={<MyLocation />}
              onClick={() => capturePoint('B')}
              disabled={gpsBusy !== null}
            >
              {gpsBusy === 'B' ? t('circuitCreate.capturing') : t('circuitCreate.capturePointB')}
            </Button>
          </Box>

          {gpsInfo && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {gpsInfo}
            </Alert>
          )}

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={6}>
              <TextField
                fullWidth
                label={t('circuitCreate.pointALat')}
                type="number"
                value={controlLineALat}
                onChange={(e) => setControlLineALat(e.target.value)}
                required
                slotProps={{ htmlInput: { step: '0.0001' } }}
                placeholder="34.8431"
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                label={t('circuitCreate.pointALng')}
                type="number"
                value={controlLineALng}
                onChange={(e) => setControlLineALng(e.target.value)}
                required
                slotProps={{ htmlInput: { step: '0.0001' } }}
                placeholder="136.5407"
              />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={6}>
              <TextField
                fullWidth
                label={t('circuitCreate.pointBLat')}
                type="number"
                value={controlLineBLat}
                onChange={(e) => setControlLineBLat(e.target.value)}
                required
                slotProps={{ htmlInput: { step: '0.0001' } }}
                placeholder="34.8432"
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                label={t('circuitCreate.pointBLng')}
                type="number"
                value={controlLineBLng}
                onChange={(e) => setControlLineBLng(e.target.value)}
                required
                slotProps={{ htmlInput: { step: '0.0001' } }}
                placeholder="136.5408"
              />
            </Grid>
          </Grid>

          {/* 片道モードのゴールライン */}
          {measureType === 'ONE_WAY' && (
            <>
              <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                {t('circuitCreate.goalLineCoords')}
              </Typography>
              <Alert severity="info" sx={{ mb: 2 }}>
                {t('circuitCreate.goalLineInfo')}
              </Alert>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                <Button
                  variant="outlined"
                  startIcon={<MyLocation />}
                  onClick={() => capturePoint('GA')}
                  disabled={gpsBusy !== null}
                >
                  {gpsBusy === 'GA' ? t('circuitCreate.capturing') : t('circuitCreate.captureGoalA')}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<MyLocation />}
                  onClick={() => capturePoint('GB')}
                  disabled={gpsBusy !== null}
                >
                  {gpsBusy === 'GB' ? t('circuitCreate.capturing') : t('circuitCreate.captureGoalB')}
                </Button>
              </Box>

              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={6}>
                  <TextField
                    fullWidth
                    label={t('circuitCreate.goalALat')}
                    type="number"
                    value={goalLineALat}
                    onChange={(e) => setGoalLineALat(e.target.value)}
                    required
                    slotProps={{ htmlInput: { step: '0.0001' } }}
                  />
                </Grid>
                <Grid size={6}>
                  <TextField
                    fullWidth
                    label={t('circuitCreate.goalALng')}
                    type="number"
                    value={goalLineALng}
                    onChange={(e) => setGoalLineALng(e.target.value)}
                    required
                    slotProps={{ htmlInput: { step: '0.0001' } }}
                  />
                </Grid>
              </Grid>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={6}>
                  <TextField
                    fullWidth
                    label={t('circuitCreate.goalBLat')}
                    type="number"
                    value={goalLineBLat}
                    onChange={(e) => setGoalLineBLat(e.target.value)}
                    required
                    slotProps={{ htmlInput: { step: '0.0001' } }}
                  />
                </Grid>
                <Grid size={6}>
                  <TextField
                    fullWidth
                    label={t('circuitCreate.goalBLng')}
                    type="number"
                    value={goalLineBLng}
                    onChange={(e) => setGoalLineBLng(e.target.value)}
                    required
                    slotProps={{ htmlInput: { step: '0.0001' } }}
                  />
                </Grid>
              </Grid>
            </>
          )}

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            {t('circuitCreate.courseDetail')}
          </Typography>

          <TextField
            fullWidth
            label={t('circuitCreate.referenceLapTimeSeconds')}
            type="number"
            value={referenceTime}
            onChange={(e) => setReferenceTime(e.target.value ? parseFloat(e.target.value) : '')}
            sx={{ mb: 2 }}
            placeholder="例: 110"
          />

          <TextField
            fullWidth
            label={t('circuitCreate.courseLengthKm')}
            type="number"
            value={courseLength}
            onChange={(e) => setCourseLength(e.target.value)}
            sx={{ mb: 2 }}
            slotProps={{ htmlInput: { step: '0.01' } }}
            placeholder="例: 5.807"
          />

          <TextField
            fullWidth
            label={t('circuitCreate.elevationGainM')}
            type="number"
            value={elevationGain}
            onChange={(e) => setElevationGain(e.target.value ? parseInt(e.target.value) : '')}
            sx={{ mb: 2 }}
            placeholder="例: 45"
          />

          <TextField
            fullWidth
            label={t('circuitCreate.description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            rows={3}
            sx={{ mb: 2 }}
            placeholder={t('circuitCreate.descriptionPlaceholder')}
          />

          <FormControlLabel
            control={
              <Switch
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
            }
            label={t('circuitCreate.publicCircuit')}
            sx={{ mb: 3 }}
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading || !name || !country || !controlLineALat || !controlLineALng || !controlLineBLat || !controlLineBLng}
              fullWidth
            >
              {loading ? t('circuitCreate.registering') : t('circuitCreate.register')}
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={() => navigate('/dashboard')}
              disabled={loading}
            >
              {t('circuitCreate.cancel')}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}
