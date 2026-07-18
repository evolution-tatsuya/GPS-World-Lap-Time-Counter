// サーキット登録ページ

import { useState } from 'react';
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

const SPORT_CATEGORIES = ['CAR', 'MOTORCYCLE', 'RUNNING', 'BICYCLE'] as const;
const COURSE_TYPES = ['CLOSED_CIRCUIT', 'PUBLIC_ROAD', 'OFF_ROAD'] as const;

export default function CircuitCreate() {
  const navigate = useNavigate();
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
  const [referenceTime, setReferenceTime] = useState<number | ''>('');
  const [courseLength, setCourseLength] = useState('');
  const [elevationGain, setElevationGain] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gpsBusy, setGpsBusy] = useState<null | 'A' | 'B' | 'LINE'>(null);
  const [gpsInfo, setGpsInfo] = useState('');

  if (!user) {
    navigate('/login');
    return null;
  }

  // 現在地でA点またはB点を取得
  const capturePoint = async (point: 'A' | 'B') => {
    setError('');
    setGpsInfo('');
    setGpsBusy(point);
    try {
      const pos = await getCurrentPositionOnce();
      const lat = pos.lat.toFixed(6);
      const lng = pos.lng.toFixed(6);
      if (point === 'A') {
        setControlLineALat(lat);
        setControlLineALng(lng);
      } else {
        setControlLineBLat(lat);
        setControlLineBLng(lng);
      }
      setGpsInfo(`地点${point}を取得しました（精度±${Math.round(pos.accuracy)}m）`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '位置情報の取得に失敗しました');
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
        `現在地を中心に幅約16mのラインを生成しました（精度±${Math.round(pos.accuracy)}m）`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '位置情報の取得に失敗しました');
    } finally {
      setGpsBusy(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiClient.post('/circuits', {
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
        referenceTime: referenceTime ? referenceTime * 1000 : null, // 秒→ミリ秒
        courseLength: courseLength || null,
        elevationGain: elevationGain || null,
        description: description || null,
        isPublic,
      });

      navigate(`/circuits/${response.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'サーキットの登録に失敗しました');
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
          <AddLocationAlt sx={{ mr: 1, fontSize: 32 }} />
          <Typography variant="h4" component="h1">
            新規サーキット登録
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            基本情報
          </Typography>

          <TextField
            fullWidth
            label="サーキット名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            sx={{ mb: 2 }}
            placeholder="例: Suzuka Circuit"
          />

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="国"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                required
                placeholder="例: Japan"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="都道府県（任意）"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="例: Mie"
              />
            </Grid>
          </Grid>

          <TextField
            fullWidth
            select
            label="コースタイプ"
            value={courseType}
            onChange={(e) => setCourseType(e.target.value as any)}
            required
            sx={{ mb: 2 }}
          >
            <MenuItem value="CLOSED_CIRCUIT">クローズドサーキット</MenuItem>
            <MenuItem value="PUBLIC_ROAD">公道</MenuItem>
            <MenuItem value="OFF_ROAD">オフロード</MenuItem>
          </TextField>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>対応スポーツ</InputLabel>
            <Select
              multiple
              value={sportCategories}
              onChange={(e) => setSportCategories(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
              input={<OutlinedInput label="対応スポーツ" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value} size="small" />
                  ))}
                </Box>
              )}
            >
              <MenuItem value="CAR">自動車</MenuItem>
              <MenuItem value="MOTORCYCLE">オートバイ</MenuItem>
              <MenuItem value="RUNNING">ランニング</MenuItem>
              <MenuItem value="BICYCLE">自転車</MenuItem>
            </Select>
          </FormControl>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            コントロールライン座標（GPS）
          </Typography>

          <Alert severity="info" sx={{ mb: 2 }}>
            計測ライン（車が通過する地点）です。実際にその場所に立って
            「現在地から自動生成」を押すと、道を横切る幅約16mのラインを
            自動で作成します。公道テストはこれが簡単です。
          </Alert>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<MyLocation />}
              onClick={captureLineFromHere}
              disabled={gpsBusy !== null}
            >
              {gpsBusy === 'LINE' ? '取得中...' : '現在地からラインを自動生成'}
            </Button>
            <Button
              variant="outlined"
              startIcon={<MyLocation />}
              onClick={() => capturePoint('A')}
              disabled={gpsBusy !== null}
            >
              {gpsBusy === 'A' ? '取得中...' : '現在地でA点'}
            </Button>
            <Button
              variant="outlined"
              startIcon={<MyLocation />}
              onClick={() => capturePoint('B')}
              disabled={gpsBusy !== null}
            >
              {gpsBusy === 'B' ? '取得中...' : '現在地でB点'}
            </Button>
          </Box>

          {gpsInfo && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {gpsInfo}
            </Alert>
          )}

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="地点A 緯度"
                type="number"
                value={controlLineALat}
                onChange={(e) => setControlLineALat(e.target.value)}
                required
                inputProps={{ step: '0.0001' }}
                placeholder="34.8431"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="地点A 経度"
                type="number"
                value={controlLineALng}
                onChange={(e) => setControlLineALng(e.target.value)}
                required
                inputProps={{ step: '0.0001' }}
                placeholder="136.5407"
              />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="地点B 緯度"
                type="number"
                value={controlLineBLat}
                onChange={(e) => setControlLineBLat(e.target.value)}
                required
                inputProps={{ step: '0.0001' }}
                placeholder="34.8432"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="地点B 経度"
                type="number"
                value={controlLineBLng}
                onChange={(e) => setControlLineBLng(e.target.value)}
                required
                inputProps={{ step: '0.0001' }}
                placeholder="136.5408"
              />
            </Grid>
          </Grid>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            コース詳細（任意）
          </Typography>

          <TextField
            fullWidth
            label="基準ラップタイム（秒）"
            type="number"
            value={referenceTime}
            onChange={(e) => setReferenceTime(e.target.value ? parseFloat(e.target.value) : '')}
            sx={{ mb: 2 }}
            placeholder="例: 110"
          />

          <TextField
            fullWidth
            label="コース長（km）"
            type="number"
            value={courseLength}
            onChange={(e) => setCourseLength(e.target.value)}
            sx={{ mb: 2 }}
            inputProps={{ step: '0.01' }}
            placeholder="例: 5.807"
          />

          <TextField
            fullWidth
            label="高低差（m）"
            type="number"
            value={elevationGain}
            onChange={(e) => setElevationGain(e.target.value ? parseInt(e.target.value) : '')}
            sx={{ mb: 2 }}
            placeholder="例: 45"
          />

          <TextField
            fullWidth
            label="説明"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            rows={3}
            sx={{ mb: 2 }}
            placeholder="コースの特徴や注意事項など"
          />

          <FormControlLabel
            control={
              <Switch
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
            }
            label="公開サーキット"
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
              {loading ? '登録中...' : 'サーキットを登録'}
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
