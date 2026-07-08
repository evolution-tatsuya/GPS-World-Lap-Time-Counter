# GPS LAP TIMER 開発進捗状況

## 1. 基本情報

- **プロジェクト名**: GPS LAP TIMER (T-EVOLUTION)
- **ステータス**: Phase 1 完了 → Phase 2 要件定義完了
- **完了タスク数**: 3/12
- **進捗率**: 25%
- **次のマイルストーン**: データベース設計・実装
- **最終更新日**: 2026-07-08

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

**最終更新**: 2026-07-08
**更新者**: Claude Code + タツヤ
