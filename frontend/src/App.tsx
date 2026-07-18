// メインアプリケーション

import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline, Box, CircularProgress } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';

// Pages
import Home from './pages/Home';
import EventLogin from './pages/EventLogin';
import Login from './pages/Login';
import Measurement from './pages/Measurement';
import Ranking from './pages/Ranking';
import Dashboard from './pages/Dashboard';
import EventDetail from './pages/EventDetail';
import CircuitDetail from './pages/CircuitDetail';
import EventCreate from './pages/EventCreate';
import CircuitCreate from './pages/CircuitCreate';
import ComingSoon from './pages/ComingSoon';

// React Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// MUI テーマ設定
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#E10600', // T-EVOLUTION Red
    },
    background: {
      default: '#131313',
      paper: '#1E1E1E',
    },
  },
  typography: {
    fontFamily: '"Yu Gothic UI", "Hiragino Kaku Gothic ProN", sans-serif',
  },
});

function App() {
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const restoring = useAuthStore((state) => state.restoring);

  // 起動時に一度だけサーバーセッションから状態を復元（リロード対策）
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {restoring ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '100vh',
            }}
          >
            <CircularProgress />
          </Box>
        ) : (
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/event-login" element={<EventLogin />} />
            <Route path="/login" element={<Login />} />
            <Route path="/measurement" element={<Measurement />} />
            <Route path="/ranking" element={<Ranking />} />
            <Route path="/dashboard" element={<Dashboard />} />

            {/* 詳細ページ */}
            <Route path="/events/:id" element={<EventDetail />} />
            <Route path="/circuits/:id" element={<CircuitDetail />} />

            {/* 作成ページ */}
            <Route path="/events/create" element={<EventCreate />} />
            <Route path="/circuits/create" element={<CircuitCreate />} />
          </Routes>
        </Router>
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
