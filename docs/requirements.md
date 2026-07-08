# GPS LAP TIMER システム 要件定義書

**プロジェクト名**: GPS LAP TIMER (T-EVOLUTION)
**バージョン**: 2.0 (プラットフォーム化対応)
**作成日**: 2026-07-08
**ステータス**: 要件定義フェーズ

---

## 1. プロジェクト概要

### 1.1 目的
サーキット・ジムカーナ・ラリーなど、モータースポーツイベントにおいて、**スマートフォンの内蔵GPSを使って参加者全員のラップタイムを自動計測・集約・ランキング化**するWebアプリケーションを開発する。

### 1.2 背景
- 多くのサーキットやローカルイベントでは、公式のタイム計測システムが存在しない
- 個人用GPS計測アプリ(RaceChrono等)は存在するが、**イベント全体でのタイム集約機能がない**
- 運営者が毎回GPS座標を設定するのは手間がかかる
- 世界中のユーザーが使える**プラットフォーム型**にすることで、コース・イベント情報が自動蓄積され、アプリが成長していく仕組みを構築したい

### 1.3 コンセプト
**「みんなで育てる、世界共通のタイム計測プラットフォーム」**

- 運営者が一度コース情報を登録すれば、以降のイベントで再利用可能
- 参加者はイベント名・サーキット名を選択するだけで自動的に計測開始
- 国・地域・サーキット・イベント単位でデータが蓄積・共有される
- ユーザーが増えるほど登録コース・イベントが増え、アプリが自動成長

---

## 2. ユーザー種別と役割

### 2.1 一般参加者（ドライバー）
- イベントに参加し、自分のタイムを計測・記録
- ランキングを閲覧
- **要ログイン**（イベントコード入力方式、またはアカウント登録）

### 2.2 イベント運営者（オーガナイザー）
- イベントを作成・管理
- サーキット情報を登録（初回のみ、2回目以降は既存から選択）
- 参加者の管理、タイムデータの編集・削除
- 印刷用レポート出力
- **要ログイン**（運営者アカウント）

### 2.3 システム管理者（将来的に）
- サーキット情報の承認・削除
- 不正利用の監視

---

## 3. 主要機能

### 3.1 認証・ログイン機能 【新規追加】

#### 3.1.1 参加者ログイン
- **イベントコード方式**（推奨）
  - 運営者が発行した6桁のイベントコード（例: `ABC123`）を入力
  - イベント期間中のみ有効
  - QRコードでの配布も可能
- **簡易アカウント登録**（オプション）
  - 名前・メールアドレスのみ
  - 過去の自分の記録を追跡可能

#### 3.1.2 運営者ログイン
- メールアドレス + パスワード
- Google / Apple アカウント連携（将来対応）

---

### 3.2 GPS計測機能

#### 3.2.1 計測方式
- スマホ内蔵GPS（1Hz）による自動計測
- コントロールライン（2点座標で定義）の通過を線分交差判定で検知
- 時刻補間アルゴリズムで精度向上（±0.2〜0.5秒）
- Wake Lock APIで画面消灯防止

#### 3.2.2 コントロールライン設定
- **サーキット登録時に設定**（運営者が1回だけ実施）
- A点（スタートライン左端外側）、B点（右端外側）の座標
- **逆走対応機能** 【新規追加】
  - ラリー・ジムカーナ等の片道計測に対応
  - 設定画面で「A⇄B 入れ替え」ボタンを実装
  - ボタン一つでスタート/ゴールを逆転

#### 3.2.3 計測動作
- 計測開始ボタン押下 → GPS監視開始
- ライン通過検知 → ラップタイム算出 → サーバー送信
- LAST / BEST / 現在ラップタイムをリアルタイム表示
- ラップ履歴表示

---

### 3.3 サーキット・イベント管理機能 【新規追加】

#### 3.3.1 サーキット登録（運営者）
運営者が新規イベント作成時、以下を登録：

```yaml
サーキット情報:
  - 国（選択式: 日本、アメリカ、ドイツ...）
  - 都道府県/州（国選択後に動的表示）
  - サーキット名（自由入力 or 既存から選択）
  - コース種別（サーキット/ジムカーナ/ラリー/その他）
  - コントロールライン座標（A点/B点）
  - 参考ラップタイム（最速想定タイム、誤検知防止用）
  - コース説明（任意）
  - 公開設定（他の運営者も使用可/自分だけ）
```

**データベース設計イメージ:**
```sql
CREATE TABLE circuits (
  id UUID PRIMARY KEY,
  country VARCHAR(100),
  state VARCHAR(100),
  name VARCHAR(200),
  type ENUM('circuit', 'gymkhana', 'rally', 'other'),
  control_line_a_lat DECIMAL(10,7),
  control_line_a_lng DECIMAL(10,7),
  control_line_b_lat DECIMAL(10,7),
  control_line_b_lng DECIMAL(10,7),
  reference_lap_time INT, -- 秒単位
  description TEXT,
  is_public BOOLEAN,
  created_by UUID, -- 運営者ID
  created_at TIMESTAMP
);
```

#### 3.3.2 イベント作成（運営者）
```yaml
イベント情報:
  - イベント名（例: TYPE R Convention 2026 Spring）
  - サーキット選択
    - 既存のサーキット一覧から選択（国→都道府県→サーキット名の階層選択）
    - 新規登録も可能
  - 開催日
  - イベントコード（自動生成 or 手動設定）
  - 参加者上限（任意）
  - 公開範囲（一般公開/招待者のみ）
```

**データベース設計イメージ:**
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  name VARCHAR(200),
  circuit_id UUID REFERENCES circuits(id),
  event_date DATE,
  event_code VARCHAR(10) UNIQUE,
  max_participants INT,
  is_public BOOLEAN,
  organizer_id UUID,
  created_at TIMESTAMP
);
```

#### 3.3.3 参加者の操作フロー
1. アプリ起動 → イベントコード入力（例: `ABC123`）
2. サーキット・イベント情報が自動取得される
3. ドライバー名・車両情報を入力
4. 「計測開始」→ 自動でGPS計測

---

### 3.4 ランキング・データ管理機能

#### 3.4.1 ランキング表示（多軸集計） 【新規追加】
参加者・運営者が以下の軸でランキングを閲覧可能：

```yaml
集計軸:
  1. イベント単位
     - 特定イベント内での順位
     - 例: "TYPE R Convention 2026 Spring" の上位10名

  2. サーキット単位
     - 同じサーキットでの歴代記録
     - 例: "鈴鹿サーキット 国際レーシングコース" の全タイム

  3. 日付単位
     - 特定日の全イベント統合ランキング
     - 例: "2026年7月8日" に記録されたタイム

  4. 個人履歴
     - 自分の過去の全タイム
```

**表示項目:**
- 順位
- ドライバー名
- 車両
- ベストタイム
- イベント名
- サーキット名
- 日付

#### 3.4.2 データのフィルタリング
```yaml
フィルタ機能:
  - 国で絞り込み
  - 都道府県で絞り込み
  - サーキット名で検索
  - 日付範囲指定
  - 車両クラス（将来対応）
```

---

### 3.5 印刷・エクスポート機能

#### 3.5.1 印刷レイアウト
- A4縦、イベント名・日付・ランキング一覧
- PDF出力対応

#### 3.5.2 CSVエクスポート
- 運営者が全ラップデータをダウンロード可能
- 形式: `日時, ドライバー, 車両, LAP, タイム(ms), タイム, イベント名, サーキット名`

---

## 4. 技術要件

### 4.1 フロントエンド
```yaml
技術スタック:
  - React 18 + TypeScript
  - Vite（ビルドツール）
  - MUI v6（UIフレームワーク）
  - Zustand（状態管理）
  - React Query（サーバー状態管理）
  - React Router v6（ルーティング）

GPS関連:
  - Geolocation API（内蔵GPS）
  - Wake Lock API（画面消灯防止）

デプロイ:
  - Vercel または Netlify（HTTPS必須）
```

### 4.2 バックエンド
```yaml
技術スタック:
  - Node.js + Express (TypeScript)
  - Prisma ORM
  - bcrypt（パスワードハッシュ化）
  - express-session（セッション管理）

API設計:
  - RESTful API
  - 認証: Cookie-based session
  - CORS: フロントエンドURLのみ許可

デプロイ:
  - Google Cloud Run（無料枠活用）
  - または Railway / Render
```

### 4.3 データベース
```yaml
RDBMS: PostgreSQL 15+

サービス: Neon（無料枠）
  - ストレージ: 0.5GB
  - CPU時間: 月190時間
  - 同時接続: Pooled接続で10,000

主要テーブル:
  - users（ユーザー: 参加者 + 運営者）
  - circuits（サーキット情報）
  - events（イベント情報）
  - laps（ラップデータ）
  - event_participants（イベント参加者）
```

### 4.4 GPS精度
```yaml
フェーズ1（現行）:
  - スマホ内蔵GPS: 1Hz
  - 精度: ±0.2〜0.5秒
  - 用途: お楽しみ企画

フェーズ2（将来対応）:
  - 外部BLE GPSレシーバー対応（RaceBox Mini等）
  - 10Hz〜25Hz
  - 精度: ±0.05秒
  - Capacitor化が必要
```

---

## 5. データベース設計（詳細）

### 5.1 ER図（概要）
```
users (1) ──< (N) events (1) ──< (N) laps
              │
              └──> (1) circuits
```

### 5.2 主要テーブル定義

#### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  name VARCHAR(100),
  role ENUM('driver', 'organizer', 'admin') DEFAULT 'driver',
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### circuits
```sql
CREATE TABLE circuits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country VARCHAR(100) NOT NULL,
  state VARCHAR(100),
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50) DEFAULT 'circuit',
  control_line_a_lat DECIMAL(10,7) NOT NULL,
  control_line_a_lng DECIMAL(10,7) NOT NULL,
  control_line_b_lat DECIMAL(10,7) NOT NULL,
  control_line_b_lng DECIMAL(10,7) NOT NULL,
  reference_lap_time INT, -- 秒
  description TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(country, state, name) -- 同名サーキット防止
);
```

#### events
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  circuit_id UUID REFERENCES circuits(id) ON DELETE RESTRICT,
  event_date DATE NOT NULL,
  event_code VARCHAR(10) UNIQUE NOT NULL,
  max_participants INT,
  is_public BOOLEAN DEFAULT TRUE,
  organizer_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### laps
```sql
CREATE TABLE laps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  driver_name VARCHAR(100) NOT NULL, -- ログインなしの場合
  vehicle VARCHAR(100),
  lap_number INT NOT NULL,
  lap_time_ms INT NOT NULL,
  lap_time_str VARCHAR(20),
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_laps_event ON laps(event_id);
CREATE INDEX idx_laps_user ON laps(user_id);
CREATE INDEX idx_laps_time ON laps(lap_time_ms);
```

---

## 6. API設計（主要エンドポイント）

### 6.1 認証API
```yaml
POST /api/auth/login
  - リクエスト: { email, password }
  - レスポンス: { user, token }

POST /api/auth/register
  - リクエスト: { email, password, name, role }
  - レスポンス: { user }

POST /api/auth/event-login
  - リクエスト: { eventCode, driverName }
  - レスポンス: { event, circuit }

GET /api/auth/session
  - レスポンス: { user } or 401
```

### 6.2 サーキットAPI
```yaml
GET /api/circuits
  - クエリ: ?country=Japan&state=Mie
  - レスポンス: [ { id, name, country, state, ... } ]

POST /api/circuits (運営者のみ)
  - リクエスト: { country, state, name, type, controlLineA, controlLineB, ... }
  - レスポンス: { circuit }

GET /api/circuits/:id
  - レスポンス: { circuit }
```

### 6.3 イベントAPI
```yaml
GET /api/events
  - クエリ: ?circuitId=xxx&date=2026-07-08
  - レスポンス: [ { id, name, eventDate, circuit, ... } ]

POST /api/events (運営者のみ)
  - リクエスト: { name, circuitId, eventDate, maxParticipants, ... }
  - レスポンス: { event, eventCode }

GET /api/events/:eventCode
  - レスポンス: { event, circuit }
```

### 6.4 ラップAPI
```yaml
POST /api/laps
  - リクエスト: { eventId, driverName, vehicle, lapNumber, lapTimeMs, lapTimeStr }
  - レスポンス: { lap }

GET /api/laps/ranking
  - クエリ: ?eventId=xxx or ?circuitId=xxx or ?date=2026-07-08
  - レスポンス: [ { rank, driverName, vehicle, bestTime, eventName, circuitName } ]
```

---

## 7. UI/UX設計

### 7.1 画面構成

#### 参加者向け
```yaml
1. ログイン画面
   - イベントコード入力
   - または、メールログイン

2. イベント情報確認画面
   - イベント名、サーキット名、開催日表示
   - ドライバー名・車両入力
   - 「計測開始」ボタン

3. 計測画面
   - 大きなタイマー表示（現在ラップ）
   - LAST / BEST タイム
   - ラップ履歴リスト
   - GPS状態表示
   - 「計測停止」ボタン

4. ランキング画面
   - タブ切り替え: [このイベント] [このサーキット] [自分の記録]
   - フィルタ: 日付範囲、国・地域
   - リアルタイム更新
```

#### 運営者向け
```yaml
1. ダッシュボード
   - 管理中のイベント一覧
   - 「新規イベント作成」ボタン

2. イベント作成画面
   - イベント名入力
   - サーキット選択（国→都道府県→サーキット名の階層選択）
   - 新規サーキット登録フォーム
   - コントロールライン設定（地図上で2点タップ or 手動入力）
   - 「A⇄B 入れ替え」ボタン（逆走対応）
   - 参考ラップタイム設定

3. イベント管理画面
   - 参加者リスト
   - ラップデータ一覧（編集・削除可能）
   - ランキング表示
   - CSVエクスポート
   - 印刷用レイアウト
```

### 7.2 デザイン
```yaml
カラーテーマ:
  - ベース: #131313（黒）
  - アクセント: #E10600（T-EVOLUTIONレッド）
  - テキスト: #F5F5F5（白）
  - グレー: #9A9A9A

フォント:
  - 欧文: Bahnschrift（スポーティ）
  - 和文: Yu Gothic UI / Hiragino Kaku Gothic ProN

レスポンシブ:
  - モバイルファースト設計
  - タブレット・PC対応
```

---

## 8. 開発フェーズ

### Phase 1: MVP（最小限の動作確認） ✅ 完了
- 内蔵GPS 1Hz計測
- スプレッドシート連携
- 基本的なランキング表示

### Phase 2: プラットフォーム化（現在）
```yaml
優先度: 高
  - 認証機能実装（イベントコード + 運営者ログイン）
  - サーキット・イベント管理機能
  - 多軸ランキング（イベント/サーキット/日付）
  - 逆走対応機能（A⇄B入れ替え）

優先度: 中
  - 国・都道府県の階層選択UI
  - サーキット検索機能
  - 印刷・CSVエクスポート
  - データベース設計・実装（PostgreSQL + Prisma）

優先度: 低
  - 地図上でのコントロールライン設定UI
  - リアルタイムランキング更新（SSE or WebSocket）
```

### Phase 3: 高精度化（将来）
```yaml
  - 外部BLE GPS対応（Capacitor化）
  - 10Hz〜25Hz計測
  - 精度±0.05秒
```

### Phase 4: 拡張機能（将来）
```yaml
  - 車両クラス別ランキング
  - SNSシェア機能
  - ベストラップ動画連携
  - 世界ランキング
  - サーキット情報のクラウドソーシング承認システム
```

---

## 9. 非機能要件

### 9.1 パフォーマンス
```yaml
- ページ読み込み: 2秒以内（モバイル4G環境）
- GPS更新レート: 1Hz（1秒ごと）
- ランキング取得: 1秒以内（100件まで）
```

### 9.2 可用性
```yaml
- 稼働率: 99%以上（Vercel + Neonの標準SLA）
- GPS圏外時の再送機能
```

### 9.3 セキュリティ
```yaml
- パスワード: bcryptでハッシュ化（コスト12）
- セッション: httpOnly Cookie
- HTTPS必須
- SQL Injection対策: Prisma ORM使用
- XSS対策: React標準のエスケープ
```

### 9.4 スケーラビリティ
```yaml
- 初期想定: 同時接続100名/イベント
- データベース: Neon無料枠（0.5GB）で約50万ラップ記録可能
- 将来的にはシャーディング（地域別DB分割）も検討
```

---

## 10. 制約事項

### 10.1 GPS精度
- スマホ内蔵GPS: 1Hz、±0.2〜0.5秒の誤差
- 競技結果の公式記録としては使用不可（あくまで参考記録）

### 10.2 画面ロック
- iOS/Androidともに画面を点灯したまま使用する必要あり
- Wake Lock APIで対応（対応端末のみ）

### 10.3 通信環境
- ラップ送信には電波が必要
- 圏外時は復帰後に自動再送（キュー機能）

### 10.4 ブラウザ対応
```yaml
対応ブラウザ:
  - iOS: Safari 14以降
  - Android: Chrome 90以降
  - PC: Chrome / Edge / Safari 最新版
```

---

## 11. 運用ルール

### 11.1 サーキット情報の品質管理
```yaml
登録ルール:
  - コントロールライン座標は実測値を使用
  - 参考ラップタイムは実際の最速タイムを基準
  - 重複登録防止（国・都道府県・サーキット名の組み合わせでUNIQUE制約）

将来的な承認フロー:
  - 運営者が新規登録 → システム管理者が承認 → 一般公開
```

### 11.2 データ保持期間
```yaml
- ラップデータ: 無期限保存
- イベント情報: イベント終了後も保持
- セッション: 24時間で自動削除
```

---

## 12. 成功指標（KPI）

### 12.1 Phase 2完了時点
```yaml
- 登録運営者数: 10組織
- 登録サーキット数: 50箇所（日本国内中心）
- 開催イベント数: 20回
- 参加ドライバー数: 500名
- ラップ記録数: 10,000件
```

### 12.2 1年後
```yaml
- 登録運営者数: 100組織
- 登録サーキット数: 500箇所（海外含む）
- 月間アクティブユーザー: 5,000名
```

---

## 13. リスク管理

### 13.1 技術リスク
```yaml
リスク: GPS精度不足によるクレーム
対策: 利用規約で「参考記録」と明記、公式記録としての使用を禁止

リスク: スマホの画面ロック問題
対策: 初回使用時にチュートリアル表示、設定ガイド提供

リスク: データベース容量超過
対策: Neon無料枠監視、古いデータのアーカイブ機能実装
```

### 13.2 運用リスク
```yaml
リスク: サーキット情報の重複・不正確
対策: 承認フロー、運営者からの報告機能

リスク: 不正な記録の投稿
対策: 運営者による編集・削除機能、異常値検知アラート
```

---

## 14. 次のアクション

### 14.1 技術設計フェーズ
```yaml
1. データベーススキーマ確定（Prisma schema作成）
2. API仕様書作成（OpenAPI形式）
3. 画面遷移図作成（Figma等）
4. コンポーネント設計（Atomic Design）
```

### 14.2 開発環境構築
```yaml
1. GitHubリポジトリ作成
2. Neonプロジェクト作成・接続
3. Vercel連携設定
4. CI/CD構築（GitHub Actions）
```

### 14.3 実装開始
```yaml
優先度1: バックエンド基盤
  - Express + Prisma セットアップ
  - 認証API実装
  - サーキット・イベントCRUD API

優先度2: フロントエンド基盤
  - React + MUI セットアップ
  - ルーティング設定
  - 認証フロー実装

優先度3: GPS計測機能統合
  - 既存プロトタイプの移植
  - 新APIとの連携
```

---

## 付録A: 用語集

```yaml
コントロールライン:
  計測の基準となる仮想の線。コースを横切る2点（A点・B点）の座標で定義。

イベントコード:
  運営者が発行する6桁の英数字（例: ABC123）。参加者がこのコードでイベントにログイン。

逆走対応:
  スタート/ゴールラインが同じで、往路と復路でタイムを計測する場合、A点とB点を入れ替える機能。

線分交差判定:
  GPS点の移動軌跡とコントロールラインの交差を数学的に判定する手法。

時刻補間:
  2つのGPS点の間でライン通過した正確な時刻を、線形補間で推定する手法。
```

---

## 付録B: 参考情報

### 既存サービスとの比較
```yaml
RaceChrono (個人用GPS計測アプリ):
  ○ 高精度（外部GPS対応）
  ○ 日本語対応、国内サーキット収録
  × イベント全体での集約機能なし
  × ランキング機能なし

MyLaps (業務用計測システム):
  ○ プロ仕様、高精度
  ○ イベント管理機能あり
  × 高コスト（ハードウェア + ライセンス）
  × 小規模イベントには不向き

本システムの強み:
  ○ 完全無料（スマホのみで動作）
  ○ イベント全体での集約・ランキング
  ○ プラットフォーム型（世界中で使える、データ蓄積）
  △ 精度は参考記録レベル
```

---

**以上、要件定義書 v2.0**
