# GPS World Lap Time Counter - 技術設計書

**バージョン**: 2.0
**作成日**: 2026-07-08
**Phase**: 2 (プラットフォーム化)

---

## 1. システムアーキテクチャ

### 1.1 全体構成図

```
┌─────────────────────────────────────────┐
│  フロントエンド (Vercel)                │
│  - React 18 + TypeScript                │
│  - MUI v6                               │
│  - Zustand (状態管理)                   │
│  - React Query (サーバー状態)           │
│  - Geolocation API (GPS計測)            │
└─────────────┬───────────────────────────┘
              │ HTTPS (REST API)
              │
┌─────────────▼───────────────────────────┐
│  バックエンド (Google Cloud Run)        │
│  - Node.js + Express + TypeScript       │
│  - Prisma ORM                           │
│  - express-session (認証)               │
│  - bcrypt (パスワードハッシュ)          │
└─────────────┬───────────────────────────┘
              │ PostgreSQL Protocol
              │
┌─────────────▼───────────────────────────┐
│  データベース (Neon)                    │
│  - PostgreSQL 15+                       │
│  - Pooled Connection (最大10,000)       │
│  - 0.5GB ストレージ (無料枠)            │
└─────────────────────────────────────────┘
```

---

## 2. データベース設計

### 2.1 Prismaスキーマ

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ========== ユーザー管理 ==========

model User {
  id           String   @id @default(uuid())
  email        String?  @unique
  passwordHash String?  @map("password_hash")
  name         String
  role         UserRole @default(DRIVER)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  // リレーション
  circuits Circuit[]
  events   Event[]
  laps     Lap[]

  @@map("users")
}

enum UserRole {
  DRIVER     // 一般参加者
  ORGANIZER  // イベント運営者
  ADMIN      // システム管理者
}

// ========== サーキット管理 ==========

model Circuit {
  id                 String   @id @default(uuid())
  country            String   // 国 (例: "Japan", "USA")
  state              String?  // 都道府県/州 (例: "Mie", "California")
  name               String   // サーキット名 (例: "Suzuka Circuit")
  type               CircuitType @default(CIRCUIT)
  controlLineALat    Decimal  @map("control_line_a_lat") @db.Decimal(10, 7)
  controlLineALng    Decimal  @map("control_line_a_lng") @db.Decimal(10, 7)
  controlLineBLat    Decimal  @map("control_line_b_lat") @db.Decimal(10, 7)
  controlLineBLng    Decimal  @map("control_line_b_lng") @db.Decimal(10, 7)
  referenceLapTime   Int?     @map("reference_lap_time") // 秒単位
  description        String?  @db.Text
  isPublic           Boolean  @default(true) @map("is_public")
  createdBy          String?  @map("created_by")
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  // リレーション
  creator User?   @relation(fields: [createdBy], references: [id])
  events  Event[]

  @@unique([country, state, name]) // 重複防止
  @@index([country, state])        // 検索高速化
  @@map("circuits")
}

enum CircuitType {
  CIRCUIT   // サーキット
  GYMKHANA  // ジムカーナ
  RALLY     // ラリー
  OTHER     // その他
}

// ========== イベント管理 ==========

model Event {
  id              String   @id @default(uuid())
  name            String   // イベント名
  circuitId       String   @map("circuit_id")
  eventDate       DateTime @map("event_date") @db.Date
  eventCode       String   @unique @map("event_code") // 6桁コード (例: ABC123)
  maxParticipants Int?     @map("max_participants")
  isPublic        Boolean  @default(true) @map("is_public")
  organizerId     String   @map("organizer_id")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  // リレーション
  circuit   Circuit @relation(fields: [circuitId], references: [id], onDelete: Restrict)
  organizer User    @relation(fields: [organizerId], references: [id])
  laps      Lap[]

  @@index([eventCode])
  @@index([eventDate])
  @@index([circuitId])
  @@map("events")
}

// ========== ラップ記録 ==========

model Lap {
  id          String   @id @default(uuid())
  eventId     String   @map("event_id")
  userId      String?  @map("user_id") // ログインユーザーの場合
  driverName  String   @map("driver_name") // 未ログインの場合はこちらのみ
  vehicle     String?
  lapNumber   Int      @map("lap_number")
  lapTimeMs   Int      @map("lap_time_ms") // ミリ秒
  lapTimeStr  String   @map("lap_time_str") // 表示用 (例: "1:23.456")
  recordedAt  DateTime @default(now()) @map("recorded_at")

  // リレーション
  event Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User?  @relation(fields: [userId], references: [id])

  @@index([eventId, lapTimeMs]) // ランキング高速化
  @@index([userId])
  @@index([recordedAt])
  @@map("laps")
}
```

### 2.2 インデックス戦略

```yaml
高速化が必要なクエリ:
  1. イベントコードでのイベント検索
     - events.event_code (UNIQUE INDEXで自動)

  2. サーキット検索（国・都道府県フィルタ）
     - circuits(country, state)

  3. ランキング取得（イベント別、サーキット別、日付別）
     - laps(event_id, lap_time_ms)
     - laps(recorded_at)

  4. 個人履歴取得
     - laps(user_id)
```

---

## 3. API設計（詳細）

### 3.1 認証フロー

#### 3.1.1 イベントコードログイン（参加者）

```typescript
POST /api/auth/event-login
Content-Type: application/json

Request:
{
  "eventCode": "ABC123",
  "driverName": "安福",
  "vehicle": "FD2 CIVIC TYPE R"
}

Response (200):
{
  "event": {
    "id": "uuid",
    "name": "TYPE R Convention 2026",
    "eventDate": "2026-07-08",
    "circuit": {
      "id": "uuid",
      "name": "Suzuka Circuit",
      "country": "Japan",
      "state": "Mie",
      "controlLineA": { "lat": 34.123456, "lng": 136.123456 },
      "controlLineB": { "lat": 34.123457, "lng": 136.123457 },
      "referenceLapTime": 120
    }
  },
  "sessionId": "session-token"
}

Response (404):
{
  "error": "Event not found"
}
```

実装ポイント:
```typescript
// backend/src/routes/auth.ts
router.post('/event-login', async (req, res) => {
  const { eventCode, driverName, vehicle } = req.body;

  // イベントコード検証
  const event = await prisma.event.findUnique({
    where: { eventCode },
    include: { circuit: true }
  });

  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  // セッション作成（express-session）
  req.session.eventId = event.id;
  req.session.driverName = driverName;
  req.session.vehicle = vehicle;

  return res.json({ event, sessionId: req.sessionID });
});
```

#### 3.1.2 運営者ログイン

```typescript
POST /api/auth/login
Content-Type: application/json

Request:
{
  "email": "organizer@example.com",
  "password": "password123"
}

Response (200):
{
  "user": {
    "id": "uuid",
    "email": "organizer@example.com",
    "name": "安福",
    "role": "ORGANIZER"
  }
}

Response (401):
{
  "error": "Invalid credentials"
}
```

実装ポイント:
```typescript
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.userId = user.id;
  req.session.role = user.role;

  return res.json({ user: { id: user.id, email, name: user.name, role: user.role } });
});
```

---

### 3.2 サーキットAPI

#### 3.2.1 サーキット一覧取得

```typescript
GET /api/circuits?country=Japan&state=Mie

Response (200):
[
  {
    "id": "uuid",
    "name": "Suzuka Circuit",
    "country": "Japan",
    "state": "Mie",
    "type": "CIRCUIT",
    "referenceLapTime": 120,
    "isPublic": true
  },
  // ...
]
```

実装ポイント:
```typescript
router.get('/circuits', async (req, res) => {
  const { country, state } = req.query;

  const circuits = await prisma.circuit.findMany({
    where: {
      ...(country && { country }),
      ...(state && { state }),
      isPublic: true
    },
    orderBy: { name: 'asc' }
  });

  return res.json(circuits);
});
```

#### 3.2.2 サーキット新規登録（運営者のみ）

```typescript
POST /api/circuits
Content-Type: application/json
Authorization: Required (ORGANIZER role)

Request:
{
  "country": "Japan",
  "state": "Mie",
  "name": "Suzuka Circuit",
  "type": "CIRCUIT",
  "controlLineA": { "lat": 34.123456, "lng": 136.123456 },
  "controlLineB": { "lat": 34.123457, "lng": 136.123457 },
  "referenceLapTime": 120,
  "description": "国際レーシングコース",
  "isPublic": true
}

Response (201):
{
  "id": "uuid",
  "country": "Japan",
  "state": "Mie",
  "name": "Suzuka Circuit",
  // ...
}

Response (409):
{
  "error": "Circuit already exists"
}
```

実装ポイント:
```typescript
router.post('/circuits', requireAuth('ORGANIZER'), async (req, res) => {
  const { country, state, name, type, controlLineA, controlLineB, referenceLapTime, description, isPublic } = req.body;

  // 重複チェック
  const existing = await prisma.circuit.findUnique({
    where: { country_state_name: { country, state: state || '', name } }
  });

  if (existing) {
    return res.status(409).json({ error: 'Circuit already exists' });
  }

  const circuit = await prisma.circuit.create({
    data: {
      country,
      state,
      name,
      type,
      controlLineALat: controlLineA.lat,
      controlLineALng: controlLineA.lng,
      controlLineBLat: controlLineB.lat,
      controlLineBLng: controlLineB.lng,
      referenceLapTime,
      description,
      isPublic,
      createdBy: req.session.userId
    }
  });

  return res.status(201).json(circuit);
});
```

---

### 3.3 イベントAPI

#### 3.3.1 イベント作成（運営者のみ）

```typescript
POST /api/events
Content-Type: application/json
Authorization: Required (ORGANIZER role)

Request:
{
  "name": "TYPE R Convention 2026 Spring",
  "circuitId": "uuid",
  "eventDate": "2026-07-08",
  "maxParticipants": 100,
  "isPublic": true
}

Response (201):
{
  "id": "uuid",
  "name": "TYPE R Convention 2026 Spring",
  "eventCode": "ABC123", // 自動生成
  "eventDate": "2026-07-08",
  "circuit": { /* サーキット情報 */ }
}
```

実装ポイント:
```typescript
// イベントコード生成関数
function generateEventCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

router.post('/events', requireAuth('ORGANIZER'), async (req, res) => {
  const { name, circuitId, eventDate, maxParticipants, isPublic } = req.body;

  // イベントコード生成（重複チェック付き）
  let eventCode = generateEventCode();
  while (await prisma.event.findUnique({ where: { eventCode } })) {
    eventCode = generateEventCode();
  }

  const event = await prisma.event.create({
    data: {
      name,
      circuitId,
      eventDate: new Date(eventDate),
      eventCode,
      maxParticipants,
      isPublic,
      organizerId: req.session.userId
    },
    include: { circuit: true }
  });

  return res.status(201).json(event);
});
```

---

### 3.4 ラップAPI

#### 3.4.1 ラップ記録送信

```typescript
POST /api/laps
Content-Type: application/json
Authorization: Required (session)

Request:
{
  "lapNumber": 3,
  "lapTimeMs": 83456,
  "lapTimeStr": "1:23.456"
}

Response (201):
{
  "id": "uuid",
  "eventId": "uuid",
  "driverName": "安福",
  "vehicle": "FD2 CIVIC TYPE R",
  "lapNumber": 3,
  "lapTimeMs": 83456,
  "lapTimeStr": "1:23.456",
  "recordedAt": "2026-07-08T12:34:56.789Z"
}
```

実装ポイント:
```typescript
router.post('/laps', requireSession, async (req, res) => {
  const { lapNumber, lapTimeMs, lapTimeStr } = req.body;

  const lap = await prisma.lap.create({
    data: {
      eventId: req.session.eventId,
      userId: req.session.userId || null,
      driverName: req.session.driverName,
      vehicle: req.session.vehicle || '',
      lapNumber,
      lapTimeMs,
      lapTimeStr
    }
  });

  return res.status(201).json(lap);
});
```

#### 3.4.2 ランキング取得（多軸集計）

```typescript
GET /api/laps/ranking?eventId=uuid
GET /api/laps/ranking?circuitId=uuid
GET /api/laps/ranking?date=2026-07-08

Response (200):
[
  {
    "rank": 1,
    "driverName": "安福",
    "vehicle": "FD2 CIVIC TYPE R",
    "bestTime": "1:23.456",
    "bestTimeMs": 83456,
    "eventName": "TYPE R Convention 2026",
    "circuitName": "Suzuka Circuit",
    "recordedAt": "2026-07-08T12:34:56.789Z"
  },
  // ...
]
```

実装ポイント:
```typescript
router.get('/laps/ranking', async (req, res) => {
  const { eventId, circuitId, date } = req.query;

  let whereClause: any = {};

  if (eventId) {
    whereClause.eventId = eventId;
  } else if (circuitId) {
    whereClause.event = { circuitId };
  } else if (date) {
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setDate(endOfDay.getDate() + 1);
    whereClause.recordedAt = { gte: startOfDay, lt: endOfDay };
  }

  // ドライバーごとのベストラップを集計
  const laps = await prisma.lap.findMany({
    where: whereClause,
    include: {
      event: { include: { circuit: true } }
    },
    orderBy: { lapTimeMs: 'asc' }
  });

  // ドライバーごとにグループ化してベストタイムを抽出
  const bestByDriver = new Map<string, any>();
  for (const lap of laps) {
    const key = lap.userId || lap.driverName;
    if (!bestByDriver.has(key) || lap.lapTimeMs < bestByDriver.get(key).bestTimeMs) {
      bestByDriver.set(key, {
        driverName: lap.driverName,
        vehicle: lap.vehicle,
        bestTime: lap.lapTimeStr,
        bestTimeMs: lap.lapTimeMs,
        eventName: lap.event.name,
        circuitName: lap.event.circuit.name,
        recordedAt: lap.recordedAt
      });
    }
  }

  const ranking = Array.from(bestByDriver.values())
    .sort((a, b) => a.bestTimeMs - b.bestTimeMs)
    .map((item, index) => ({ rank: index + 1, ...item }));

  return res.json(ranking);
});
```

---

## 4. フロントエンド設計

### 4.1 ディレクトリ構成

```
frontend/
├── src/
│   ├── pages/           # ページコンポーネント
│   │   ├── Login.tsx
│   │   ├── EventLogin.tsx
│   │   ├── Dashboard.tsx      # 運営者ダッシュボード
│   │   ├── EventCreate.tsx
│   │   ├── Measurement.tsx    # GPS計測画面
│   │   └── Ranking.tsx
│   ├── components/      # 再利用可能なコンポーネント
│   │   ├── CircuitSelector.tsx  # 国→都道府県→サーキット階層選択
│   │   ├── ControlLineSwap.tsx  # A⇄B入れ替えボタン
│   │   ├── GPSTimer.tsx
│   │   ├── LapList.tsx
│   │   └── RankingTable.tsx
│   ├── hooks/           # カスタムフック
│   │   ├── useGPS.ts            # GPS計測ロジック
│   │   ├── useAuth.ts
│   │   └── useRanking.ts
│   ├── api/             # API クライアント（React Query）
│   │   ├── auth.ts
│   │   ├── circuits.ts
│   │   ├── events.ts
│   │   └── laps.ts
│   ├── stores/          # Zustand ストア
│   │   ├── authStore.ts
│   │   └── measurementStore.ts
│   ├── types/           # TypeScript型定義
│   │   └── index.ts
│   └── utils/           # ユーティリティ
│       ├── gpsUtils.ts          # 線分交差判定・補間
│       └── formatTime.ts
├── public/
└── vite.config.ts
```

### 4.2 状態管理（Zustand）

```typescript
// stores/authStore.ts
import create from 'zustand';

interface AuthState {
  user: User | null;
  event: Event | null;
  sessionId: string | null;
  login: (email: string, password: string) => Promise<void>;
  eventLogin: (eventCode: string, driverName: string, vehicle: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  event: null,
  sessionId: null,
  login: async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    set({ user: data.user });
  },
  eventLogin: async (eventCode, driverName, vehicle) => {
    const res = await fetch('/api/auth/event-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventCode, driverName, vehicle })
    });
    const data = await res.json();
    set({ event: data.event, sessionId: data.sessionId });
  },
  logout: () => set({ user: null, event: null, sessionId: null })
}));
```

### 4.3 GPS計測フック

```typescript
// hooks/useGPS.ts
import { useState, useEffect } from 'react';
import { crossCheck } from '../utils/gpsUtils';

interface UseGPSOptions {
  controlLineA: [number, number];
  controlLineB: [number, number];
  minLapTime: number; // 秒
  oneWay: boolean;
  onLap: (lapTimeMs: number) => void;
}

export function useGPS(options: UseGPSOptions) {
  const [running, setRunning] = useState(false);
  const [currentLapMs, setCurrentLapMs] = useState(0);
  const [lastLapMs, setLastLapMs] = useState<number | null>(null);
  const [bestLapMs, setBestLapMs] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState('GPS 未接続');

  useEffect(() => {
    if (!running) return;

    let prevPt: any = null;
    let lastCrossT: number | null = null;
    let firstSign: number | null = null;

    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        const pt = { lat: p.coords.latitude, lng: p.coords.longitude, t: p.timestamp };
        setGpsStatus(`GPS OK  精度±${Math.round(p.coords.accuracy)}m`);

        if (prevPt) {
          const hit = crossCheck(prevPt, pt, options.controlLineA, options.controlLineB);
          if (hit) {
            // 方向フィルタ
            if (options.oneWay) {
              if (firstSign === null) firstSign = hit.sign;
              else if (hit.sign !== firstSign) {
                prevPt = pt;
                return;
              }
            }

            const crossT = prevPt.t + hit.u * (pt.t - prevPt.t);
            if (lastCrossT === null) {
              lastCrossT = crossT; // 1周目
            } else {
              const lapMs = crossT - lastCrossT;
              if (lapMs >= options.minLapTime * 1000) {
                lastCrossT = crossT;
                setLastLapMs(lapMs);
                if (bestLapMs === null || lapMs < bestLapMs) {
                  setBestLapMs(lapMs);
                }
                options.onLap(lapMs);
              }
            }
          }
        }
        prevPt = pt;
      },
      (e) => setGpsStatus('GPSエラー: ' + e.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );

    // タイマー更新
    const interval = setInterval(() => {
      if (lastCrossT !== null) {
        setCurrentLapMs(Date.now() - lastCrossT);
      }
    }, 100);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(interval);
    };
  }, [running, options]);

  return {
    running,
    currentLapMs,
    lastLapMs,
    bestLapMs,
    gpsStatus,
    start: () => setRunning(true),
    stop: () => setRunning(false)
  };
}
```

### 4.4 階層選択コンポーネント（国→都道府県→サーキット）

```typescript
// components/CircuitSelector.tsx
import React, { useState } from 'react';
import { Autocomplete, TextField, Box } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getCircuits } from '../api/circuits';

interface CircuitSelectorProps {
  onSelect: (circuit: Circuit | null) => void;
}

export function CircuitSelector({ onSelect }: CircuitSelectorProps) {
  const [country, setCountry] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);

  const { data: circuits = [] } = useQuery({
    queryKey: ['circuits', country, state],
    queryFn: () => getCircuits({ country, state }),
    enabled: !!country
  });

  // 国リスト（ハードコード、または別API）
  const countries = ['Japan', 'USA', 'Germany', 'UK', 'France', /* ... */];

  // 都道府県リスト（国選択後に動的取得）
  const states = country === 'Japan'
    ? ['Hokkaido', 'Aomori', 'Tokyo', 'Mie', 'Osaka', /* ... */]
    : country === 'USA'
    ? ['California', 'Texas', 'New York', /* ... */]
    : [];

  return (
    <Box>
      <Autocomplete
        options={countries}
        value={country}
        onChange={(_, val) => {
          setCountry(val);
          setState(null);
          onSelect(null);
        }}
        renderInput={(params) => <TextField {...params} label="国" />}
      />

      {country && (
        <Autocomplete
          options={states}
          value={state}
          onChange={(_, val) => {
            setState(val);
            onSelect(null);
          }}
          renderInput={(params) => <TextField {...params} label="都道府県/州" />}
        />
      )}

      {country && (
        <Autocomplete
          options={circuits}
          getOptionLabel={(opt) => opt.name}
          value={circuits.find((c) => c.id === onSelect) || null}
          onChange={(_, val) => onSelect(val)}
          renderInput={(params) => <TextField {...params} label="サーキット" />}
        />
      )}
    </Box>
  );
}
```

### 4.5 A⇄B入れ替えボタン

```typescript
// components/ControlLineSwap.tsx
import React from 'react';
import { Button } from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';

interface ControlLineSwapProps {
  lineA: [number, number];
  lineB: [number, number];
  onSwap: (newA: [number, number], newB: [number, number]) => void;
}

export function ControlLineSwap({ lineA, lineB, onSwap }: ControlLineSwapProps) {
  return (
    <Button
      variant="outlined"
      startIcon={<SwapHorizIcon />}
      onClick={() => onSwap(lineB, lineA)}
    >
      A⇄B 入れ替え（逆走対応）
    </Button>
  );
}
```

---

## 5. デプロイ設計

### 5.1 フロントエンド（Vercel）

```yaml
プロジェクト: GPS World Lap Time Counter Frontend
リポジトリ: github.com/evolution-tatsuya/GPS-World-Lap-Time-Counter (frontend/)
ビルドコマンド: npm run build
出力ディレクトリ: dist
環境変数:
  - VITE_API_URL=https://api.gps-lap-timer.com
```

### 5.2 バックエンド（Google Cloud Run）

```yaml
プロジェクト: GPS World Lap Time Counter Backend
リポジトリ: github.com/evolution-tatsuya/GPS-World-Lap-Time-Counter (backend/)
Dockerfile:
  FROM node:18-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --only=production
  COPY . .
  RUN npx prisma generate
  CMD ["npm", "start"]

Cloud Run設定:
  - リージョン: asia-northeast1（東京）
  - CPU: 1
  - メモリ: 512MB
  - 同時実行数: 80
  - 最小インスタンス: 0（コスト削減）
  - 最大インスタンス: 10

環境変数:
  - DATABASE_URL=postgresql://...（Neon接続文字列）
  - SESSION_SECRET=ランダム文字列32文字以上
  - FRONTEND_URL=https://gps-lap-timer.vercel.app
```

### 5.3 データベース（Neon）

```yaml
プロジェクト: GPS World Lap Time Counter DB
リージョン: ap-southeast-1（シンガポール、日本最寄り）
接続方式: Pooled（最大10,000接続）
無料枠制限:
  - ストレージ: 0.5GB
  - CPU時間: 月190時間
  - 同時接続: 100（Pooledで10,000）
```

---

## 6. セキュリティ設計

### 6.1 認証・認可

```yaml
セッション管理:
  - express-session + Cookie
  - httpOnly: true（XSS対策）
  - secure: true（HTTPS必須）
  - sameSite: 'strict'
  - maxAge: 24時間

パスワード:
  - bcrypt（コスト12）
  - 最小8文字、英数字記号混在推奨

ロール制御:
  - DRIVER: 自分のラップ記録のみ
  - ORGANIZER: 自分のイベント・サーキット管理
  - ADMIN: 全データ管理
```

### 6.2 入力検証

```yaml
バリデーション（Zod使用）:
  - イベントコード: 6文字、英数字のみ
  - 座標: -90〜90（緯度）、-180〜180（経度）
  - ラップタイム: 1〜9999999ms
  - サーキット名: 1〜200文字
```

### 6.3 レート制限

```yaml
express-rate-limit:
  - ログインAPI: 5回/分
  - ラップ記録API: 100回/分（1Hz × 余裕）
  - その他API: 60回/分
```

---

## 7. パフォーマンス最適化

### 7.1 フロントエンド

```yaml
コード分割:
  - React.lazy() + Suspense
  - ルートごとに分割（/login, /measurement, /ranking）

キャッシング:
  - React Query: staleTime 5分
  - サーキット一覧、イベント情報

画像最適化:
  - ロゴ: SVG推奨
  - アイコン: MUI Icons（Tree-shaking）

バンドルサイズ:
  - Vite + Rollup
  - gzip圧縮
  - 初回ロード < 100KB（目標）
```

### 7.2 バックエンド

```yaml
データベースクエリ:
  - N+1問題回避（include使用）
  - インデックス活用
  - ランキング集計はキャッシュ検討（Redis、将来）

接続プール:
  - Prisma デフォルト設定
  - pool_size: 10

レスポンスキャッシュ:
  - サーキット一覧: Cache-Control: max-age=3600
  - イベント情報: max-age=300
```

---

## 8. 監視・ログ

### 8.1 エラー追跡

```yaml
ツール: Sentry（無料枠）
対象:
  - フロントエンド: JavaScript エラー
  - バックエンド: 未処理の例外
  - GPS計測エラー（精度低下、タイムアウト）
```

### 8.2 ログ

```yaml
フォーマット: JSON
レベル:
  - ERROR: 500エラー、DB接続失敗
  - WARN: GPS精度低下（>50m）、レート制限
  - INFO: API リクエスト、ラップ記録
  - DEBUG: 開発環境のみ
```

---

## 9. 次のステップ

### 9.1 プロトタイプからの移行

```yaml
タスク:
  1. lap_timer.html の GPS計測ロジックを useGPS フックに移植
  2. gas_backend.gs のロジックを Express API に置き換え
  3. スプレッドシートデータを PostgreSQL にマイグレーション（必要に応じて）
```

### 9.2 開発開始順序

```yaml
Week 1-2: バックエンド基盤
  - Prisma スキーマ実装
  - 認証API実装
  - サーキット・イベントCRUD API

Week 3-4: フロントエンド基盤
  - React + MUI セットアップ
  - ルーティング、認証フロー
  - CircuitSelector 実装

Week 5-6: GPS計測統合
  - useGPS フック実装
  - Measurement ページ
  - ラップ送信・表示

Week 7-8: ランキング・管理機能
  - 多軸ランキング表示
  - 運営者ダッシュボード
  - 印刷・CSVエクスポート
```

---

## 10. 環境分離とマルチアプリケーション統合設計

### 10.1 開発環境と本番環境の分離

#### 10.1.1 データベース環境構成

```yaml
必須要件:
  - 開発環境（Backend）と本番環境（Frontend）でデータベースを完全分離
  - 各環境で独立したNeonプロジェクトを使用

環境一覧:
  development (DEV):
    Neon Project: GPS-World-Lap-Time-Counter-DEV
    Database: gps_lap_timer_dev
    Region: ap-southeast-1 (Singapore)
    用途: バックエンドAPI開発、テストデータ
    接続文字列: 環境変数 DATABASE_URL_DEV

  production (PROD):
    Neon Project: GPS-World-Lap-Time-Counter-PROD
    Database: gps_lap_timer_prod
    Region: ap-southeast-1 (Singapore)
    用途: 本番フロントエンド稼働、実データ
    接続文字列: 環境変数 DATABASE_URL_PROD

  staging (STG) - 将来:
    Neon Project: GPS-World-Lap-Time-Counter-STG
    Database: gps_lap_timer_stg
    用途: デプロイ前検証
```

#### 10.1.2 環境変数管理

```bash
# backend/.env.development
DATABASE_URL="postgresql://dev_user:***@dev-ep-xxx.c-2.ap-southeast-1.aws.neon.tech/gps_lap_timer_dev"
NODE_ENV=development
PORT=8432
FRONTEND_URL="http://localhost:3247"
SESSION_SECRET="dev-secret-key-change-in-production"

# backend/.env.production
DATABASE_URL="postgresql://prod_user:***@prod-ep-xxx.c-2.ap-southeast-1.aws.neon.tech/gps_lap_timer_prod"
NODE_ENV=production
PORT=8432
FRONTEND_URL="https://gps-lap-timer.vercel.app"
SESSION_SECRET="<本番用の安全な秘密鍵>"

# backend/.env.staging (将来)
DATABASE_URL="postgresql://stg_user:***@stg-ep-xxx.c-2.ap-southeast-1.aws.neon.tech/gps_lap_timer_stg"
NODE_ENV=staging
PORT=8432
FRONTEND_URL="https://gps-lap-timer-staging.vercel.app"
SESSION_SECRET="<staging用の秘密鍵>"
```

#### 10.1.3 環境切り替えフロー

```bash
# 開発環境でのマイグレーション
npm run migrate:dev
# 内部: NODE_ENV=development npx prisma migrate dev

# 本番環境へのデプロイ時
npm run migrate:prod
# 内部: NODE_ENV=production npx prisma migrate deploy

# Prisma Client生成（環境ごと）
npm run generate:dev
npm run generate:prod
```

**package.jsonスクリプト例**:
```json
{
  "scripts": {
    "migrate:dev": "dotenv -e .env.development -- npx prisma migrate dev",
    "migrate:prod": "dotenv -e .env.production -- npx prisma migrate deploy",
    "generate:dev": "dotenv -e .env.development -- npx prisma generate",
    "generate:prod": "dotenv -e .env.production -- npx prisma generate",
    "dev": "dotenv -e .env.development -- ts-node src/index.ts",
    "start": "dotenv -e .env.production -- node dist/index.js"
  }
}
```

---

### 10.2 総合ECサイトとの統合設計（Phase 3以降）

#### 10.2.1 SSO（シングルサインオン）アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│  統合認証サービス (t-evolution-auth)                         │
│  - Auth0 / Keycloak / Firebase Auth                         │
│  - JWT発行・検証                                            │
│  - セッション管理 (Redis)                                    │
└─────────────┬───────────────────────────┬───────────────────┘
              │                           │
    ┌─────────▼──────────┐      ┌────────▼─────────────┐
    │ ECサイト           │      │ GPS Lap Timer        │
    │ (ec.t-evolution.jp)│      │ (lap.t-evolution.jp) │
    │                    │      │                      │
    │ - 商品管理         │      │ - イベント管理       │
    │ - 注文処理         │      │ - ラップ計測         │
    │ - ポイント管理     │      │ - ランキング         │
    └────────────────────┘      └──────────────────────┘
              │                           │
              └───────────┬───────────────┘
                          │
              ┌───────────▼──────────────┐
              │ 統合管理ダッシュボード    │
              │ (admin.t-evolution.jp)   │
              │ - 全アプリ統括管理       │
              └──────────────────────────┘
```

#### 10.2.2 JWT認証フロー

```yaml
ログイン手順:
  1. ユーザーがECサイトでログイン（email + password）
  2. 認証サービスがユーザー検証
  3. JWT発行（有効期限24時間）
     payload:
       - user_id: UUID
       - email: string
       - role: string[]
       - apps: ['ec', 'lap-timer', 'inventory']
       - iat: timestamp
       - exp: timestamp
  4. JWTをhttpOnly Cookieに保存
  5. フロントエンドに認証成功を返却

GPS Lap Timerアクセス時:
  1. ブラウザが自動的にJWT付きリクエスト送信
  2. GPS Lap Timer APIがJWTを検証
     - 署名検証（公開鍵）
     - 有効期限チェック
     - apps配列に'lap-timer'が含まれるか確認
  3. 検証成功 → ログイン済み状態でアプリ使用可能
  4. 検証失敗 → 認証サービスにリダイレクト
```

#### 10.2.3 API設計（統合認証対応）

**Phase 2（現在）の認証API**:
```typescript
POST /api/auth/login
  Request: { email, password }
  Response: { user, sessionId }
  セッション: express-session (Cookie)
```

**Phase 3（SSO統合後）の認証API**:
```typescript
GET /api/auth/verify-token
  Headers: Cookie: jwt=<token>
  Response:
    200: { valid: true, user: { id, email, name, role } }
    401: { valid: false, error: 'Invalid or expired token' }

POST /api/auth/sync-user
  Headers: Authorization: Bearer <jwt>
  Request: { ecUserId, email, name }
  Response: { success: true, userId: UUID }
  動作:
    1. ECサイトからのユーザー情報をGPS Lap Timer DBに同期
    2. ec_user_id カラムに紐付け
    3. 既存ユーザーの場合はマージ

POST /api/auth/link-ec-account
  Headers: Cookie: jwt=<lap-timer-session>
  Request: { ecAuthCode }
  Response: { success: true, linkedEcUserId: UUID }
  動作:
    1. 既存のGPS Lap Timerユーザーが
    2. ECアカウントと連携する際に使用
```

#### 10.2.4 データベース統合戦略

**マイクロサービス型（推奨）**:
```yaml
各アプリ独立DB + 統合認証DB:
  t-evolution-auth (Neon Project):
    tables:
      - users (統合ユーザーマスタ)
      - oauth_providers
      - sessions
      - refresh_tokens

  t-evolution-ec (Neon Project):
    tables:
      - products
      - orders
      - payments
      - ec_user_profiles (EC固有情報)

  t-evolution-lap-timer (Neon Project):
    tables:
      - users (GPS Lap Timer用、auth.usersと紐付け)
      - circuits
      - events
      - laps

連携方法:
  - users.auth_user_id → t-evolution-auth.users.id (外部参照)
  - API経由でのデータ取得
  - Webhook / Message Queueでのイベント通知
```

**usersテーブル拡張（Phase 3）**:
```sql
-- Phase 2 → Phase 3 への移行用カラム追加
ALTER TABLE users
  ADD COLUMN auth_user_id UUID,           -- 統合認証DBのユーザーID
  ADD COLUMN ec_user_id UUID,             -- ECサイトのユーザーID
  ADD COLUMN oauth_provider TEXT,         -- 'ec-platform', 'google', 'apple'
  ADD COLUMN oauth_id TEXT UNIQUE,        -- OAuth提供元のID
  ADD COLUMN is_synced_from_ec BOOLEAN DEFAULT FALSE,
  ADD COLUMN last_synced_at TIMESTAMP;

CREATE INDEX idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX idx_users_ec_user_id ON users(ec_user_id);
CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_id);
```

#### 10.2.5 RBAC（ロールベースアクセス制御）設計

**Phase 2（現在）**: シンプルなenum
```prisma
enum UserRole {
  DRIVER
  ORGANIZER
  ADMIN
}
```

**Phase 3（拡張）**: RBAC対応
```prisma
model Role {
  id          String   @id @default(uuid())
  name        String   @unique  // 'super_admin', 'ec_manager', 'event_organizer'
  description String?
  permissions Json     // ['lap:read', 'lap:write', 'event:create']
  appContext  String   // 'ec-platform', 'gps-lap-timer', 'all'
  createdAt   DateTime @default(now())

  userRoles UserRole[]
  @@map("roles")
}

model UserRole {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  roleId    String   @map("role_id")
  grantedBy String?  @map("granted_by")
  grantedAt DateTime @default(now()) @map("granted_at")

  user      User     @relation(fields: [userId], references: [id])
  role      Role     @relation(fields: [roleId], references: [id])

  @@unique([userId, roleId])
  @@map("user_roles")
}

model Permission {
  id          String  @id @default(uuid())
  code        String  @unique  // 'lap:read', 'event:create:own'
  appContext  String
  description String?

  @@map("permissions")
}
```

**権限チェックミドルウェア**:
```typescript
// Phase 2（現在）
const requireRole = (role: UserRole) => (req, res, next) => {
  if (req.session.user?.role === role || req.session.user?.role === 'ADMIN') {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
};

// Phase 3（RBAC）
const requirePermission = (permission: string) => async (req, res, next) => {
  const hasPermission = await checkUserPermission(req.user.id, permission);
  if (hasPermission) {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden', requiredPermission: permission });
  }
};

// 使用例
router.post('/events', requirePermission('event:create'), createEvent);
```

---

### 10.3 統合管理ダッシュボード設計（Phase 4）

#### 10.3.1 BFF（Backend for Frontend）パターン

```yaml
アーキテクチャ:
  フロントエンド: 統合管理画面（React SPA）
    ↓
  BFF Layer: 管理画面専用API（Node.js + Express）
    ↓ 並列リクエスト
  ├─→ ECサイトAPI
  ├─→ GPS Lap Timer API
  └─→ 在庫管理API

BFFエンドポイント例:
  GET /api/admin/integrated/dashboard
    → 全アプリの統計情報を集約
    → { ecStats, lapTimerStats, inventoryStats, userActivity }

  GET /api/admin/integrated/user/:id/overview
    → 特定ユーザーの全アプリでの活動を集約
    → { ecProfile, orderHistory, lapRecords, eventParticipation }
```

#### 10.3.2 データ同期戦略

```yaml
リアルタイム同期:
  - WebSocket / Server-Sent Events
  - ユーザーログイン状態
  - イベント参加登録

非同期同期（Webhook）:
  ECサイト → GPS Lap Timer:
    - イベントチケット購入時
    - POST /api/webhooks/ec/ticket-purchased
      → イベント参加者として自動登録

  GPS Lap Timer → ECサイト:
    - ベストラップ達成時
    - POST https://ec-api/webhooks/lap-timer/best-lap
      → クーポン自動発行

Message Queue（将来）:
  - RabbitMQ / AWS SQS
  - イベント駆動アーキテクチャ
  - トピック: user.created, lap.recorded, event.started
```

---

### 10.4 実装ロードマップ（統合対応）

```yaml
Phase 2（現在・2026 Q3-Q4）:
  週1-2: 環境分離
    - Neon DEV/PROD プロジェクト作成 ✅
    - 環境変数管理整備
    - CI/CD構築（GitHub Actions）

  週3-10: 単体完成
    - バックエンドAPI実装
    - フロントエンド実装
    - デプロイ

Phase 3（EC統合・2027 Q1-Q2）:
  月1: SSO基盤構築
    - Auth0 / Keycloak導入
    - JWT発行・検証実装
    - 統合認証DB構築

  月2-3: データ同期
    - usersテーブル拡張
    - 同期API実装
    - 既存データ移行

  月4: RBAC移行
    - roles/permissions テーブル作成
    - 権限チェックロジック実装

Phase 4（統合管理画面・2027 Q3-Q4）:
  月1-2: BFF構築
  月3: 統合ダッシュボード実装
  月4: Webhook/Queue実装

Phase 5（スケールアウト・2028〜）:
  - Kubernetes導入
  - マルチリージョン展開
  - グローバルCDN
```

---

### 10.5 セキュリティ考慮事項（統合環境）

```yaml
JWT管理:
  - httpOnly Cookie（XSS対策）
  - Secure flag（HTTPS必須）
  - SameSite=Strict（CSRF対策）
  - 短い有効期限（24時間）+ Refresh Token

API認証:
  - 各アプリ間API通信は内部トークン使用
  - 公開鍵暗号方式（RS256）
  - トークンローテーション

データアクセス制限:
  - 各アプリは自DBのみアクセス可能
  - クロスDB参照は禁止
  - API経由のみでデータ取得

監査ログ:
  - ユーザー操作ログ（全アプリ統合）
  - API呼び出しログ
  - データ変更履歴
```

---

**以上、技術設計書 v2.1（環境分離・統合対応版）**
**最終更新**: 2026-07-08
**次回更新**: Phase 3開始時
