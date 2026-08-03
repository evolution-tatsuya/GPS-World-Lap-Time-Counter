# GPS World Lap Time Counter 開発進捗状況

## 1. 基本情報

- **プロジェクト名**: GPS World Lap Time Counter (T-EVOLUTION)
- **ステータス**: 単体HTML版で実働（富士検証OK）＋フルアプリ土台稼働。販売化ゴール像確定 → 製作フェーズ着手
- **次のマイルストーン**: フルアプリで Phase 1（ロール認証＋イベントコード参加＋DB集約＋計測ロジック移植）
- **最終更新日**: 2026-08-03

> 販売化に向けた全決定事項・ロードマップは `docs/PRODUCT_VISION.md` を正とする。要件は `docs/requirements.md` 追補v2.2。

## 2. 完了済みタスク

### Phase 1: プロトタイプ開発 ✅
- [x] 内蔵GPS 1Hz計測ロジック実装
- [x] スプレッドシート連携（GAS）
- [x] 基本的なランキング表示

### Phase 2: 要件定義 ✅
- [x] 要件定義書作成（docs/requirements.md）
  - プラットフォーム化コンセプト確定
  - ユーザー認証（イベントコード方式）
  - 国・都道府県・サーキット階層管理
  - 多軸ランキング（イベント/サーキット/日付）
  - 逆走対応機能（A⇄B入れ替え）
- [x] 技術設計書作成（docs/technical_design.md）
  - データベース設計（Prisma schema）
  - API仕様（RESTful）
  - フロントエンド設計（React + MUI）

## 3. 実装計画

### Phase 2: プラットフォーム化（現在）

#### Week 1-2: 開発環境構築 & データベース実装
- [ ] GitHubリポジトリ作成
- [ ] Neonプロジェクト作成・接続
- [ ] Prismaスキーマ実装・マイグレーション
- [ ] Express + Prisma セットアップ

#### Week 3-4: バックエンドAPI実装
- [ ] 認証API（イベントコード + 運営者ログイン）
- [ ] サーキットCRUD API
- [ ] イベントCRUD API
- [ ] ラップ記録API
- [ ] ランキングAPI（多軸集計）

#### Week 5-6: フロントエンド基盤構築
- [ ] React + MUI + Vite セットアップ
- [ ] ルーティング設定（React Router）
- [ ] 認証フロー実装
- [ ] CircuitSelector（国→都道府県→サーキット階層選択）
- [ ] ControlLineSwap（A⇄B入れ替えボタン）

#### Week 7-8: GPS計測機能統合
- [ ] useGPS フック実装（プロトタイプから移植）
- [ ] Measurement ページ
- [ ] ラップ送信・表示
- [ ] リアルタイムランキング更新

#### Week 9-10: 運営者機能・仕上げ
- [ ] 運営者ダッシュボード
- [ ] イベント作成・管理画面
- [ ] 印刷・CSVエクスポート
- [ ] デプロイ（Vercel + Google Cloud Run）

### Phase 3: 高精度化（将来）
- [ ] Capacitor化（ネイティブアプリ化）
- [ ] 外部BLE GPS対応（RaceBox Mini等）
- [ ] 10Hz〜25Hz計測、精度±0.05秒

### Phase 4: 拡張機能（将来）
- [ ] 車両クラス別ランキング
- [ ] SNSシェア機能
- [ ] 世界ランキング
- [ ] サーキット情報クラウドソーシング

## 4. プロジェクト構成

```
time logging/
├── docs/
│   ├── requirements.md         # 要件定義書 v2.0
│   ├── technical_design.md     # 技術設計書 v2.0
│   └── SCOPE_PROGRESS.md       # 進捗管理（このファイル）
├── prototype/                  # Phase 1 プロトタイプ
│   ├── lap_timer.html          # GPS計測アプリ（HTML単体）
│   ├── gas_backend.gs          # スプレッドシート連携（GAS）
│   └── setup_guide.md          # 導入手順
├── mockups/                    # UI/UXモックアップ（今後追加）
├── frontend/                   # Phase 2 フロントエンド（未作成）
└── backend/                    # Phase 2 バックエンド（未作成）
```

## 5. 次のアクション

### 優先度：高（今すぐ実施）
1. GitHubリポジトリ作成
2. Neonプロジェクト作成・DATABASE_URL取得
3. Prismaスキーマ実装（technical_design.md参照）
4. データベースマイグレーション実行

### 優先度：中（Week 1-2）
5. Express + TypeScript セットアップ
6. 認証API実装
7. React + MUI セットアップ

### 優先度：低（Week 3以降）
8. 全API実装
9. フロントエンド実装
10. デプロイ・テスト

## 6. 技術スタック

### フロントエンド
- React 18 + TypeScript
- Vite（ビルドツール）
- MUI v6（UIフレームワーク）
- Zustand（状態管理）
- React Query（サーバー状態）
- React Router v6
- Geolocation API（GPS）

### バックエンド
- Node.js + Express + TypeScript
- Prisma ORM
- bcrypt（パスワード）
- express-session（セッション）

### データベース
- PostgreSQL 15+（Neon）

### デプロイ
- フロントエンド: Vercel
- バックエンド: Google Cloud Run
- データベース: Neon（ap-southeast-1）

## 7. 成功指標（KPI）

### Phase 2完了時点（目標）
- 登録運営者数: 10組織
- 登録サーキット数: 50箇所
- 開催イベント数: 20回
- 参加ドライバー数: 500名
- ラップ記録数: 10,000件

## 8. リスク・課題

### 技術リスク
- GPS精度（±0.2〜0.5秒）→ 利用規約で「参考記録」と明記
- スマホ画面ロック問題 → チュートリアル・設定ガイド提供

### 運用リスク
- サーキット情報の重複・不正確 → 承認フロー実装（将来）
- 不正記録の投稿 → 運営者による編集・削除機能

---

## 進捗更新（2026-08-03）

### 実働済み（単体HTML版 `gps/` ＝ 実走検証で稼働）
- [x] GPS計測（コントロールライン通過検出）／堅牢送信（未送信キュー＋再送）
- [x] 富士スピードウェイ実走で全10ラップ検出・記録成功
- [x] アウトラップ=LAP1、セッション管理、集計シート（総合＋個別）
- [x] 入力項目（ゼッケン/クラス/タイヤ/メモ）、計測画面の速度/最高速/デルタ
- [x] テレメトリー（GPS軌跡記録＋Leaflet地図＋スクラブ＋GPX/JSONエクスポート）
- [x] 片道モード（スタート/ゴール別ライン、区間計測・繰り返し）
- [x] 富士実走版を `stable/` に固定（プロモ用サンプル）

### 確定（2026-08-03、詳細は PRODUCT_VISION.md）
- [x] ゴール像・ロードマップ・要件（追補v2.2）を文書化
- [x] コース登録=運営可+ADMIN承認 / 課金=サブスク主軸 / 記録=DB集約
- [x] 運営モニター（ライブ+集計）/ 統括ページ（全CRUD）
- [x] 多言語=まず日英中韓（i18n） / 配布=PWA化
- [x] プロモ枠（課金免除・イベントコード/QR・参加者PR＋営業デモ）

### フルアプリ現状（2026-08-03 起動検証）
- [x] backend/frontend 起動OK、DB(Neon)稼働（users3/courses7/events11/laps11）
- [x] 認証・laps API(保存/ranking/CSV/history/delete)・events API(CRUD)・権限ガード 実装済み
- [ ] i18n / 片道モードのDB対応 / プロモ枠 / 統括ページ網羅 / ライブモニター / PWA化 → **これから製作**

### 次フェーズ（製作）: フルアプリ Phase 1
- [ ] ロール認証＋イベントコード参加＋コース自動セットを通す（参加者導線からGPS登録を外す）
- [ ] ラップ送信をDBへ集約、単体HTML版の計測ロジック（アウトラップ/セッション/片道）を移植

---

**最終更新**: 2026-08-03
**更新者**: Claude Code + タツヤ
