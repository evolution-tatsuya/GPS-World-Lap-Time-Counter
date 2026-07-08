// メインアプリケーション

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Pages
import Home from './pages/Home';
import EventLogin from './pages/EventLogin';
import Login from './pages/Login';

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
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/event-login" element={<EventLogin />} />
            <Route path="/login" element={<Login />} />
            {/* 他のルートは後で追加 */}
          </Routes>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
