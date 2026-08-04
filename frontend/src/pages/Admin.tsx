// 統括管理ページ（ADMIN専用）
// 既存APIの範囲で全イベント・全コースを横断閲覧し、イベント単位でCSV出力する。
// ユーザー管理・コース承認・プロモ枠はバックエンドAPI実装後に有効化（現状は「準備中」）。

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material';
import { Switch } from '@mui/material';
import { Download, AdminPanelSettings, Logout } from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { getEvents } from '../api/events';
import { getCircuits } from '../api/circuits';
import { exportEventLapsCsv } from '../api/laps';
import { getAdminUsers, setUserPromo, type AdminUser } from '../api/admin';
import LanguageSwitcher from '../components/LanguageSwitcher';
import type { Event, Circuit } from '../types';

export default function Admin() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, isAdmin, logout } = useAuthStore();

  const [tab, setTab] = useState(0);
  const [events, setEvents] = useState<Event[]>([]);
  const [courses, setCourses] = useState<Circuit[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [promoUpdatingId, setPromoUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    // ADMIN以外はダッシュボードへ
    if (!isAdmin()) {
      navigate('/dashboard');
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const [ev, cs, us] = await Promise.all([getEvents(), getCircuits(), getAdminUsers()]);
        setEvents(ev);
        setCourses(cs);
        setUsers(us);
        setError('');
      } catch {
        setError(t('admin.loadFailed'));
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = async (eventId: string) => {
    setExportingId(eventId);
    try {
      await exportEventLapsCsv(eventId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.exportFailed'));
    } finally {
      setExportingId(null);
    }
  };

  const handleTogglePromo = async (u: AdminUser) => {
    setPromoUpdatingId(u.id);
    try {
      const updated = await setUserPromo(u.id, !u.isPromo);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isPromo: updated.isPromo } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.promoUpdateFailed'));
    } finally {
      setPromoUpdatingId(null);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!isAdmin()) return null;

  return (
    <Container maxWidth="lg" sx={{ mt: 2, pb: 4 }}>
      {/* ヘッダー */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <AdminPanelSettings sx={{ mr: 1, color: 'primary.main', fontSize: 32 }} />
          <Box>
            <Typography variant="h4" component="h1">
              {t('admin.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('admin.subtitle')} — {user?.name}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <LanguageSwitcher />
          <Button startIcon={<Logout />} onClick={handleLogout} variant="outlined">
            {t('common.logout')}
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* サマリー */}
      {!loading && (
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <Chip label={`${t('admin.totalEvents')}: ${events.length}`} color="primary" />
          <Chip label={`${t('admin.totalCourses')}: ${courses.length}`} color="info" />
        </Box>
      )}

      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
          <Tab label={t('admin.tabEvents')} />
          <Tab label={t('admin.tabCourses')} />
          <Tab label={t('admin.tabUsers')} />
        </Tabs>
      </Paper>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {/* 全イベント */}
      {!loading && tab === 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('admin.eventCode')}</TableCell>
                <TableCell>{t('admin.eventName')}</TableCell>
                <TableCell>{t('admin.course')}</TableCell>
                <TableCell>{t('admin.date')}</TableCell>
                <TableCell align="right">{t('admin.exportCsv')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>{t('admin.noEvents')}</TableCell>
                </TableRow>
              )}
              {events.map((ev) => (
                <TableRow key={ev.id} hover>
                  <TableCell><Chip label={ev.eventCode} size="small" /></TableCell>
                  <TableCell
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/events/${ev.id}`)}
                  >
                    {ev.name}
                  </TableCell>
                  <TableCell>{ev.circuit?.name || ev.course?.name || '—'}</TableCell>
                  <TableCell>{new Date(ev.eventDate).toLocaleDateString()}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      startIcon={<Download />}
                      onClick={() => handleExport(ev.id)}
                      disabled={exportingId === ev.id}
                    >
                      {exportingId === ev.id ? t('admin.exporting') : t('admin.exportCsv')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* 全コース */}
      {!loading && tab === 1 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('admin.course')}</TableCell>
                <TableCell>{t('admin.country')}</TableCell>
                <TableCell>{t('admin.measureType')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {courses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3}>{t('admin.noCourses')}</TableCell>
                </TableRow>
              )}
              {courses.map((c) => (
                <TableRow key={c.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/circuits/${c.id}`)}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.country}{c.state ? ` / ${c.state}` : ''}</TableCell>
                  <TableCell>
                    <Chip
                      label={c.measureType === 'ONE_WAY' ? t('admin.oneway') : t('admin.lap')}
                      size="small"
                      color={c.measureType === 'ONE_WAY' ? 'secondary' : 'default'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ユーザー管理（プロモ枠ON/OFF） */}
      {!loading && tab === 2 && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>{t('admin.promoHint')}</Alert>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('admin.userName')}</TableCell>
                  <TableCell>{t('admin.userEmail')}</TableCell>
                  <TableCell>{t('admin.userRole')}</TableCell>
                  <TableCell align="center">{t('admin.userEvents')}</TableCell>
                  <TableCell align="center">{t('admin.userPromo')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>{t('admin.noUsers')}</TableCell>
                  </TableRow>
                )}
                {users.map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>{u.email || '—'}</TableCell>
                    <TableCell><Chip label={u.role} size="small" /></TableCell>
                    <TableCell align="center">{u._count.events}</TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={u.isPromo}
                        disabled={promoUpdatingId === u.id}
                        onChange={() => handleTogglePromo(u)}
                        color="secondary"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Container>
  );
}
