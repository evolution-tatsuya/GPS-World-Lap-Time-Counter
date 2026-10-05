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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  FormControlLabel,
} from '@mui/material';
import { Switch } from '@mui/material';
import { Download, AdminPanelSettings, Logout, PersonAdd } from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { getEvents } from '../api/events';
import { exportEventLapsCsv } from '../api/laps';
import {
  getAdminUsers, setUserPromo, setUserCamera, setUserSubscription, createOrganizer,
  impersonateUser, deleteOrganizer, type AdminUser,
  getAdminCourses, setCourseApproval, type AdminCourse, type ApprovalStatus,
} from '../api/admin';
import LanguageSwitcher from '../components/LanguageSwitcher';
import type { Event } from '../types';

export default function Admin() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, isAdmin, logout, setImpersonating, restoreSession } = useAuthStore();

  const [tab, setTab] = useState(0);
  const [events, setEvents] = useState<Event[]>([]);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [promoUpdatingId, setPromoUpdatingId] = useState<string | null>(null);

  // 運営アカウント作成ダイアログ
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [newOrg, setNewOrg] = useState({ email: '', name: '', password: '', cameraEnabled: true });

  const handleCreateOrganizer = async () => {
    if (!newOrg.email.trim() || !newOrg.name.trim() || !newOrg.password) {
      setCreateError('メール・名前・パスワードを入力してください');
      return;
    }
    if (newOrg.password.length < 8) {
      setCreateError('パスワードは8文字以上にしてください');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const created = await createOrganizer({
        email: newOrg.email.trim(),
        name: newOrg.name.trim(),
        password: newOrg.password,
        cameraEnabled: newOrg.cameraEnabled,
      });
      setUsers((prev) => [created, ...prev]);
      setCreateSuccess(`運営アカウント「${created.name}」を作成しました（${created.email}）`);
      setCreateOpen(false);
      setNewOrg({ email: '', name: '', password: '', cameraEnabled: true });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '作成に失敗しました');
    } finally {
      setCreating(false);
    }
  };

  // 代理ログイン（このユーザーとして開く）。サーバーのセッションを切替後、
  // restoreSession で最新のユーザー情報を取り直してからダッシュボードへ。
  const handleImpersonate = async (u: AdminUser) => {
    try {
      await impersonateUser(u.id);
      await restoreSession();
      setImpersonating(true);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : '代理ログインに失敗しました');
    }
  };

  // 運営アカウント削除
  const handleDeleteUser = async (u: AdminUser) => {
    if (!window.confirm(`運営アカウント「${u.name}」を削除しますか？この操作は取り消せません。`)) return;
    try {
      await deleteOrganizer(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました');
    }
  };

  useEffect(() => {
    // ADMIN以外はダッシュボードへ
    if (!isAdmin()) {
      navigate('/dashboard');
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const [ev, cs, us] = await Promise.all([getEvents(), getAdminCourses(), getAdminUsers()]);
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

  const handleToggleCamera = async (u: AdminUser) => {
    setPromoUpdatingId(u.id);
    try {
      const updated = await setUserCamera(u.id, !u.cameraEnabled);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, cameraEnabled: updated.cameraEnabled } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '車載カメラ設定の更新に失敗しました');
    } finally {
      setPromoUpdatingId(null);
    }
  };

  const handleToggleSub = async (u: AdminUser) => {
    setPromoUpdatingId(u.id);
    try {
      const active = u.subscriptionStatus === 'ACTIVE';
      const updated = await setUserSubscription(u.id, {
        status: active ? 'INACTIVE' : 'ACTIVE',
        plan: active ? 'NONE' : (u.role === 'ORGANIZER' ? 'ORGANIZER' : 'PERSONAL'),
      });
      setUsers((prev) => prev.map((x) => (x.id === u.id
        ? { ...x, subscriptionStatus: updated.subscriptionStatus, subscriptionPlan: updated.subscriptionPlan }
        : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.subUpdateFailed'));
    } finally {
      setPromoUpdatingId(null);
    }
  };

  const handleApproval = async (id: string, status: ApprovalStatus) => {
    setApprovingId(id);
    try {
      const updated = await setCourseApproval(id, status);
      setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, approvalStatus: updated.approvalStatus } : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.approvalUpdateFailed'));
    } finally {
      setApprovingId(null);
    }
  };

  const approvalChip = (s: ApprovalStatus) => {
    const map = {
      PENDING: { label: t('admin.statusPending'), color: 'warning' as const },
      APPROVED: { label: t('admin.statusApproved'), color: 'success' as const },
      REJECTED: { label: t('admin.statusRejected'), color: 'error' as const },
    };
    const m = map[s];
    return <Chip label={m.label} color={m.color} size="small" />;
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

      {/* 全コース（承認フロー） */}
      {!loading && tab === 1 && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>{t('admin.approvalHint')}</Alert>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('admin.course')}</TableCell>
                  <TableCell>{t('admin.country')}</TableCell>
                  <TableCell>{t('admin.measureType')}</TableCell>
                  <TableCell>{t('admin.creator')}</TableCell>
                  <TableCell>{t('admin.status')}</TableCell>
                  <TableCell align="right"> </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {courses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>{t('admin.noCourses')}</TableCell>
                  </TableRow>
                )}
                {courses.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/circuits/${c.id}`)}
                    >
                      {c.name}
                    </TableCell>
                    <TableCell>{c.country}{c.state ? ` / ${c.state}` : ''}</TableCell>
                    <TableCell>
                      <Chip
                        label={c.measureType === 'ONE_WAY' ? t('admin.oneway') : t('admin.lap')}
                        size="small"
                        color={c.measureType === 'ONE_WAY' ? 'secondary' : 'default'}
                      />
                    </TableCell>
                    <TableCell>{c.creator?.name || '—'}</TableCell>
                    <TableCell>{approvalChip(c.approvalStatus)}</TableCell>
                    <TableCell align="right">
                      {c.approvalStatus !== 'APPROVED' && (
                        <Button
                          size="small"
                          color="success"
                          disabled={approvingId === c.id}
                          onClick={() => handleApproval(c.id, 'APPROVED')}
                        >
                          {t('admin.approve')}
                        </Button>
                      )}
                      {c.approvalStatus === 'PENDING' && (
                        <Button
                          size="small"
                          color="error"
                          disabled={approvingId === c.id}
                          onClick={() => handleApproval(c.id, 'REJECTED')}
                        >
                          {t('admin.reject')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* ユーザー管理（プロモ枠ON/OFF） */}
      {!loading && tab === 2 && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <Alert severity="info" sx={{ flex: 1, minWidth: 240 }}>{t('admin.subHint')}</Alert>
            <Button variant="contained" startIcon={<PersonAdd />} onClick={() => { setCreateError(''); setCreateOpen(true); }}>
              運営を追加
            </Button>
          </Box>
          {createSuccess && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setCreateSuccess('')}>{createSuccess}</Alert>}
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('admin.userName')}</TableCell>
                  <TableCell>{t('admin.userEmail')}</TableCell>
                  <TableCell>{t('admin.userRole')}</TableCell>
                  <TableCell align="center">{t('admin.userEvents')}</TableCell>
                  <TableCell align="center">{t('admin.subStatus')}</TableCell>
                  <TableCell align="center">{t('admin.userPromo')}</TableCell>
                  <TableCell align="center">車載カメラ</TableCell>
                  <TableCell align="center">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>{t('admin.noUsers')}</TableCell>
                  </TableRow>
                )}
                {users.map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>{u.email || '—'}</TableCell>
                    <TableCell><Chip label={u.role} size="small" /></TableCell>
                    <TableCell align="center">{u._count.events}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={u.subscriptionStatus === 'ACTIVE' ? t('admin.subActive') : t('admin.subInactive')}
                        color={u.subscriptionStatus === 'ACTIVE' ? 'success' : 'default'}
                        size="small"
                        sx={{ mr: 1 }}
                      />
                      <Button
                        size="small"
                        variant="text"
                        disabled={promoUpdatingId === u.id}
                        onClick={() => handleToggleSub(u)}
                      >
                        {u.subscriptionStatus === 'ACTIVE' ? t('admin.subDeactivate') : t('admin.subActivate')}
                      </Button>
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={u.isPromo}
                        disabled={promoUpdatingId === u.id}
                        onChange={() => handleTogglePromo(u)}
                        color="secondary"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={u.cameraEnabled}
                        disabled={promoUpdatingId === u.id || u.role !== 'ORGANIZER'}
                        onChange={() => handleToggleCamera(u)}
                        color="primary"
                      />
                    </TableCell>
                    <TableCell align="center">
                      {u.role === 'ORGANIZER' && (
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <Button size="small" variant="outlined" onClick={() => handleImpersonate(u)}>
                            開く
                          </Button>
                          <Button size="small" variant="outlined" color="error" onClick={() => handleDeleteUser(u)}>
                            削除
                          </Button>
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* 運営アカウント作成ダイアログ */}
      <Dialog open={createOpen} onClose={() => !creating && setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>運営アカウントを追加</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {createError && <Alert severity="error">{createError}</Alert>}
            <TextField
              label="名前（運営者・チーム名など）"
              value={newOrg.name}
              onChange={(e) => setNewOrg((o) => ({ ...o, name: e.target.value }))}
              fullWidth
            />
            <TextField
              label="メールアドレス（ログインID）"
              type="email"
              value={newOrg.email}
              onChange={(e) => setNewOrg((o) => ({ ...o, email: e.target.value }))}
              fullWidth
            />
            <TextField
              label="初期パスワード（8文字以上）"
              value={newOrg.password}
              onChange={(e) => setNewOrg((o) => ({ ...o, password: e.target.value }))}
              fullWidth
              helperText="運営者に伝えてください。本人がログイン後に変更できます。"
            />
            <FormControlLabel
              control={<Switch checked={newOrg.cameraEnabled} onChange={(e) => setNewOrg((o) => ({ ...o, cameraEnabled: e.target.checked }))} />}
              label="車載カメラ（ライブ映像）機能を有効にする"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={creating}>キャンセル</Button>
          <Button onClick={handleCreateOrganizer} variant="contained" disabled={creating}>
            {creating ? <CircularProgress size={20} /> : '作成'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
