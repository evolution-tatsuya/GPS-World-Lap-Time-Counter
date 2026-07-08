# GPS LAP TIMER

**世界中で育つ、モータースポーツタイム計測プラットフォーム**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Phase](https://img.shields.io/badge/phase-2%20development-orange.svg)](docs/SCOPE_PROGRESS.md)

---

## 📖 プロジェクト概要

GPS LAP TIMER は、サーキット・ジムカーナ・ラリーなどのモータースポーツイベントで、**スマートフォンの内蔵GPSを使って参加者全員のラップタイムを自動計測・集約・ランキング化**するWebアプリケーションです。

### 🎯 コンセプト

**「みんなで育てる、世界共通のタイム計測プラットフォーム」**

- 運営者が一度コース情報を登録すれば、以降のイベントで再利用可能
- 参加者はイベント名・サーキット名を選択するだけで自動的に計測開始
- 国・地域・サーキット・イベント単位でデータが蓄積・共有される
- ユーザーが増えるほど登録コース・イベントが増え、アプリが自動成長

---

## ✨ 主要機能

### Phase 1: プロトタイプ ✅
- [x] スマホ内蔵GPS（1Hz）による自動ラップ計測
- [x] 線分交差判定 + 時刻補間アルゴリズム（精度±0.2〜0.5秒）
- [x] スプレッドシート連携（Google Apps Script）
- [x] 基本的なランキング表示

### Phase 2: プラットフォーム化（開発中）
- [ ] **ユーザー認証**
  - イベントコード方式（参加者）
  - メールアドレス + パスワード（運営者）
- [ ] **サーキット・イベント管理**
  - 国・都道府県・サーキット名の階層管理
  - コントロールライン座標の登録・再利用
  - 逆走対応（A⇄B入れ替えボタン）
- [ ] **多軸ランキング**
  - イベント別ランキング
  - サーキット別歴代記録
  - 日付別統合ランキング
  - 個人履歴
- [ ] **運営者機能**
  - イベント作成・管理
  - 参加者管理
  - 印刷・CSVエクスポート

### Phase 3: 高精度化（将来）
- [ ] 外部BLE GPS対応（RaceBox Mini等）
- [ ] 10Hz〜25Hz計測、精度±0.05秒
- [ ] Capacitor化（ネイティブアプリ）

---

## 🚀 技術スタック

### フロントエンド
- React 18 + TypeScript
- MUI v6（UIフレームワーク）
- Zustand（状態管理）
- React Query（サーバー状態管理）
- Vite（ビルドツール）
- Geolocation API（GPS計測）

### バックエンド
- Node.js + Express + TypeScript
- Prisma ORM
- bcrypt（パスワードハッシュ化）
- express-session（セッション管理）

### データベース
- PostgreSQL 15+（Neon）

### デプロイ
- フロントエンド: Vercel
- バックエンド: Google Cloud Run
- データベース: Neon（ap-southeast-1）

---

## 📁 プロジェクト構成

```
Lap-Time-Counter/
├── docs/
│   ├── requirements.md         # 要件定義書 v2.0
│   ├── technical_design.md     # 技術設計書 v2.0
│   └── SCOPE_PROGRESS.md       # 進捗管理
├── prototype/                  # Phase 1 プロトタイプ
│   ├── lap_timer.html          # GPS計測アプリ（HTML単体）
│   ├── gas_backend.gs          # スプレッドシート連携（GAS）
│   └── setup_guide.md          # 導入手順
├── frontend/                   # Phase 2 フロントエンド（開発中）
├── backend/                    # Phase 2 バックエンド（開発中）
└── README.md                   # このファイル
```

---

## 📚 ドキュメント

- **[要件定義書](docs/requirements.md)** - 全機能の詳細仕様
- **[技術設計書](docs/technical_design.md)** - データベース設計、API仕様、実装ガイド
- **[進捗管理](docs/SCOPE_PROGRESS.md)** - 開発スケジュールとタスク管理

---

## 🛠️ セットアップ（Phase 1プロトタイプ）

Phase 1のプロトタイプを試す場合：

1. **スプレッドシート設定**
   ```
   1. Googleスプレッドシートを新規作成
   2. 拡張機能 → Apps Script
   3. prototype/gas_backend.gs の内容を貼り付け
   4. setup() 関数を実行
   5. デプロイ → ウェブアプリとして公開
   ```

2. **HTMLアプリの配置**
   ```
   prototype/lap_timer.html を GitHub Pages または Netlify にデプロイ
   （HTTPS必須）
   ```

3. **詳細手順**
   - [prototype/setup_guide.md](prototype/setup_guide.md) を参照

---

## 🎯 開発ロードマップ

### Week 1-2: 開発環境構築 & データベース実装
- [x] GitHubリポジトリ作成
- [ ] Neonプロジェクト作成・接続
- [ ] Prismaスキーマ実装・マイグレーション
- [ ] Express + Prisma セットアップ

### Week 3-4: バックエンドAPI実装
- [ ] 認証API（イベントコード + 運営者ログイン）
- [ ] サーキットCRUD API
- [ ] イベントCRUD API
- [ ] ラップ記録API
- [ ] ランキングAPI（多軸集計）

### Week 5-6: フロントエンド基盤構築
- [ ] React + MUI + Vite セットアップ
- [ ] ルーティング設定（React Router）
- [ ] 認証フロー実装
- [ ] CircuitSelector（国→都道府県→サーキット階層選択）
- [ ] ControlLineSwap（A⇄B入れ替えボタン）

### Week 7-8: GPS計測機能統合
- [ ] useGPS フック実装（プロトタイプから移植）
- [ ] Measurement ページ
- [ ] ラップ送信・表示
- [ ] リアルタイムランキング更新

### Week 9-10: 運営者機能・仕上げ
- [ ] 運営者ダッシュボード
- [ ] イベント作成・管理画面
- [ ] 印刷・CSVエクスポート
- [ ] デプロイ（Vercel + Google Cloud Run）

---

## 🤝 コントリビューション

現在、Phase 2開発中のため、コントリビューションは一時受け付けていません。Phase 2完了後に募集を開始します。

---

## 📄 ライセンス

MIT License

---

## 👤 作成者

**evolution-tatsuya** (T.E.A.M. T-EVOLUTION)

- GitHub: [@evolution-tatsuya](https://github.com/evolution-tatsuya)

---

## 📊 進捗状況

**Phase**: 2 (プラットフォーム化)
**ステータス**: 要件定義完了
**進捗率**: 25%
**最終更新**: 2026-07-08

詳細: [docs/SCOPE_PROGRESS.md](docs/SCOPE_PROGRESS.md)
