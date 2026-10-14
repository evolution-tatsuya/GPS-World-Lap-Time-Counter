# GPS ⇄ EC サブスク連携 — GPS側 確定仕様書（GPSエージェント発）

- 作成: 2026-10-13 / 作成者: GPSエージェント（連携実装の主体）
- 位置づけ: 在庫管理エージェント・ECエージェントへの「まず報告」への正式回答 ＋ GPS側実装の確定設計
- 根拠: EC(`ショッピングページ〜決済ページ/`)・在庫管理(`在庫管理/`)・GPS(`time logging/`) の実コードを精読済み。file:line根拠は既存設計書 `EC_SUBSCRIPTION_INTEGRATION_DESIGN.md` 参照。
- **本書で「確定」した §1/§2/§3 が、3システムが食い違わないための契約。**

---

## 0. まず報告（在庫管理側・EC側からの質問への回答）

### Q1. GPSの現状（認証方式・テナント/アカウント相当モデル）
- **認証**: express-session（httpOnly Cookie・Neon/PostgreSQL保存）。bcrypt。JWTではない。
  連携受け口はこれとは別系統の **`x-integration-key` ヘッダ認証**（在庫と同型）で実装する。
- **モデル**: GPSは**単一テナント**。テナント相当モデルは無く、**`User`（role=ORGANIZER/PERSONAL想定）が契約の実体**。
  `User.email` は nullable unique、`passwordHash` も nullable → **EC先行作成（本人未登録でもprovision可）がスキーマ上問題なく可能**。

### Q2. GPS本番ベースURL（EC側が叩く先）
```
https://gps-lap-timer-563027052499.asia-northeast1.run.app
```
→ EC側 env `GPS_API_BASE_URL` にこれを設定。受け口は `POST {BASE}/api/integration/*`。

### Q3. 共有シークレット
- **GPS専用に新規発行済み**（在庫用とは別値・使い回さない）。
- 値は **PWマネージャ `GPS-EC-Integration-Key`** に保存。チャット平文では渡さない。
- env名: EC側 `GPS_API_KEY` / GPS側 `GPS_INTEGRATION_API_KEY` に**同一値**を設定（在庫の `INVENTORY_API_KEY`↔`INTEGRATION_API_KEY` と同構造）。

### Q4. limits / features のGPS定義 → §2で確定

---

## 1. インターフェース契約（唯一の正・3者で固定）

在庫管理と**同型**。EC送信形は `inventoryProvisionService.ts` と一字一句同じ構造。

| 項目 | 仕様 |
|---|---|
| 受け口 | `POST /api/integration/{provision, plan-change, suspend, unsuspend, reactivate}` |
| 認証 | ヘッダ `x-integration-key`（`crypto.timingSafeEqual` 定数時間比較／env未設定=503／不一致=401） |
| 冪等キー | `orderId`（= ECの `Order.orderNumber`） |
| Content-Type | `application/json` |
| タイムアウト | EC側15秒・リトライ無し（在庫と同じ。GPSは冪等なのでEC再送で回復） |

### リクエストボディ（EC→GPS）
```
provision:    { orderId*, email*, plan?, billingType?, productId?, limits?, features? }
plan-change:  { orderId*, slug?, plan?, billingType?, productId?, limits?, features? }
suspend:      { orderId*, reason? }           // reason: 'cancelled' | 'suspended'
unsuspend:    { orderId* }
reactivate:   { prevOrderId*, newOrderId*, plan?, billingType?, productId?, limits?, features? }
```
（* = 必須。billingType は `monthly|yearly|onetime`）

### レスポンス（GPS→EC）※在庫の形に準拠
```
{ success, alreadyProvisioned?, slug?, licenseKey?, activationUrl?, status? }
```
- GPSは即時有効化のため `licenseKey/activationUrl/slug` は実質 null でも可（ECの保存先は全nullable）。
- `alreadyProvisioned` と `success` が実質的に重要。HTTP: 既存=200 / 新規=201（在庫と同じ）。

---

## 2. GPS固有の limits / features 定義（GPS主導で確定）

> **背景**: GPSのサブスクは **「個人仕様(PERSONAL)」と「イベント運営(ORGANIZER)」の2系統**。各系統に2〜3プラン（内容検討中）。
> 在庫の `maxParts/maxImageMB/maxUsers` はGPSに該当概念が無いため**使わない**。

### plan（EC→GPSで送る文字列 → GPS enum へマップ）
| EC送信値(例) | GPS `SubscriptionPlan` | 系統 |
|---|---|---|
| `personal` / `PERSONAL` | `PERSONAL` | 個人仕様 |
| `organizer` / `ORGANIZER` | `ORGANIZER` | イベント運営 |

→ **どの系統の契約かは `plan` で判別**（personal系統 or organizer系統）。価格違いの複数プランは後述 `features`/将来の `tier` で表現。

### features（機能キー・GPS用に新定義。在庫のstocktake等は不使用）
GPSの実機能ゲートに対応:
| features キー | 意味 | 現状のゲート |
|---|---|---|
| `personal_measurement` | 個人計測（イベント無しの個人ラップ記録） | 既存: `laps.ts` 個人計測API（未課金402） |
| `event_hosting` | イベント主催・運営 | 将来ゲート化（現状は無制限） |
| `live_streaming` | 車載ライブ配信 | 現状は `User.cameraEnabled` 別ゲート（将来統合可） |

→ 当面、個人系統は `["personal_measurement"]`、運営系統は `["event_hosting"]`（+将来 `live_streaming`）を想定。**EC側はProductの `planFeatureKeys` にこれらを設定**。

### limits（上限値・GPSは当面「無し/最小」）
- GPSには数量上限ゲートが現状無いため、**limits は当面使用しない（空/null）**。
- 将来 `maxEventsPerMonth`（主催イベント数）等が必要になれば本仕様に追記して拡張。
- → **EC側は GPS商品では limits を送らなくてよい**（送られても GPS は無視）。

---

## 3. GPS側 実装設計（確定）— ⚠️「同時契約あり」対応

### 重要判断: 2系統同時契約 → 連携契約テーブルを新設（ハイブリッド）
GPS現状は `User` 単一の `subscriptionPlan/Status/Until` ＝ **1ユーザー1プランしか持てない**。
だが要件は「個人仕様とイベント運営を**同時契約できる**」。
→ **連携契約を1行=1契約で持つテーブル `SubscriptionGrant` を新設**し、1 User に複数ぶら下げる。

```prisma
model SubscriptionGrant {
  id               String   @id @default(uuid())
  userId           String   @map("user_id")
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provisionOrderId String   @unique @map("provision_order_id") // 冪等キー(=EC orderNumber)
  plan             SubscriptionPlan                              // PERSONAL / ORGANIZER
  status           SubscriptionStatus @default(ACTIVE)           // ACTIVE / INACTIVE / EXPIRED
  until            DateTime?  @map("until")                      // null=無期限
  billingType      String?    @map("billing_type")
  ecProductId      String?    @map("ec_product_id")
  features         String[]   @default([])
  createdAt        DateTime   @default(now()) @map("created_at")
  updatedAt        DateTime   @updatedAt      @map("updated_at")
  @@index([userId])
  @@index([plan, status])
}
```
- 冪等キーは **このテーブルの `provisionOrderId @unique`**（在庫の `Tenant.provisionOrderId` 相当。Userに付けると1ユーザー1契約に固定されてしまうため、テーブル側に持つのが正解）。
- 既存の `User.subscriptionPlan/Status/Until` は**後方互換のため残す**（既存の手動運用・ADMIN画面・フロント表示が使用中）。当面は「個人系統のミラー」として同期 or 併存。

### 課金判定の拡張（`utils/subscription.ts`）
- 現状 `canUsePaidFeatures(user)` は単一フィールド判定。これを**系統別**に拡張:
  ```
  hasActiveGrant(userId, plan): その系統の有効(ACTIVE かつ 期限内 or isPromo)なgrantがあるか
  ```
- 既存の `laps.ts` 個人計測ゲート → `hasActiveGrant(userId, 'PERSONAL')`（または features に personal_measurement を含む有効grant）で判定に差し替え。
- `isPromo` は従来どおり全系統を無条件許可。

### 追加/変更ファイル（GPS側）
| ファイル | 内容 |
|---|---|
| `backend/prisma/schema.prisma` | `SubscriptionGrant` モデル追加 + `User` に `grants SubscriptionGrant[]` リレーション |
| `backend/src/middleware/integrationAuth.ts`（新規） | 在庫 `requireIntegration.ts` を複製。env `GPS_INTEGRATION_API_KEY` 照合・503/401 |
| `backend/src/routes/integration.ts`（新規） | 5エンドポイント。`router.use(requireIntegrationKey)`。email正規化`trim().toLowerCase()` |
| `backend/src/services/integrationService.ts`（新規） | provision/suspend/unsuspend/reactivate/plan-change のDB処理（grant upsert・冪等） |
| `backend/src/utils/subscription.ts` | `hasActiveGrant` 追加・既存関数は互換維持 |
| `backend/src/routes/laps.ts` | 個人計測ゲートを grant 判定へ |
| `backend/src/index.ts` | `app.use('/api/integration', integrationRoutes)` 追加（SPAフォールバック前） |
| `backend/.env.example` | `GPS_INTEGRATION_API_KEY=` 追記 |

### 各エンドポイントの処理（GPS）
| EP | 処理 |
|---|---|
| provision | email正規化 → `User` を upsert（無ければ ORGANIZER/PERSONALロールで作成・passwordHash=null・name=暫定） → `SubscriptionGrant` を `provisionOrderId` で upsert（ACTIVE・plan・until・features）。既存orderIdなら `alreadyProvisioned:true` |
| plan-change | `provisionOrderId`(or slug) で grant 検索 → plan/until/features を「渡された項目のみ」更新 |
| suspend | grant検索 → `status=INACTIVE`（データ保持） |
| unsuspend | grant検索 → `status=ACTIVE`（+until延長） |
| reactivate | `newOrderId` で冪等チェック → `prevOrderId` の grant を newOrderId に付替え + ACTIVE復帰 |

### 本人ログイン導線（provision後）
- provision時 `passwordHash=null` で作成されるため本人は即ログイン不可。
- **当面**: ADMIN代理でパスワード設定（`admin.ts` 既存）／または招待メール+パスワード設定（メール送信は未実装のため後日）。
- ※この導線は連携の必須要件ではないため、受け口実装とは分離して後続で対応。

---

## 3.9. 🔒 在庫管理との完全分離（絶対に被らせない・最重要）

ユーザー指示: **在庫管理のサブスクと絶対に被らない・シークレットもロジックも使い回さない**こと。以下を徹底する。

| 要素 | 在庫管理 | GPS（別物） |
|---|---|---|
| 共有シークレット値 | `INVENTORY_API_KEY` の値 | **新規発行の別値**（PW `GPS-EC-Integration-Key`） |
| GPS側env名 | `INTEGRATION_API_KEY` | `GPS_INTEGRATION_API_KEY` |
| EC側env名 | `INVENTORY_API_KEY` | `GPS_API_KEY` |
| 送信先URL | inventory-backend | gps-lap-timer-563027052499... |
| EC側振り分け | `provisionTarget='inventory'` | `provisionTarget='gps'` |
| 受け手サービス | `inventoryProvisionService` | `gpsProvisionService`（新設） |
| features | stocktake/csv_import等 | personal_measurement/event_hosting |
| limits | maxParts/maxImageMB/maxUsers | 使わない |

### ⚠️ 最大の事故リスクと対策（EC側）
現状 EC の `provisionAndDeliverForOrder` は「activeなサブスク契約＝全て在庫へ送る」前提（`orderController.ts:928`）。
GPS分岐を入れる時、**`provisionTarget` での振り分けが不完全だと、GPS契約が在庫APIに飛ぶ（逆も）＝「被り」事故**になる。

対策（必須）:
1. EC側で `sub.product.provisionTarget` を見て **厳密に振り分け**。`'gps'`→GPS関数のみ、`'inventory'`→在庫関数のみ。
2. **既存の在庫商品すべてに `provisionTarget='inventory'` を明示設定**する（migration後のデータ移行）。
   新フィールドはデフォルトnullなので、放置すると「振り分け先不明」になり既存の在庫連携が壊れる or GPSに誤爆する。
3. `provisionTarget` が未設定(null)の商品は**どちらにも送らない（またはエラーログ）**フェイルセーフにし、誤爆を物理的に防ぐ。
4. 解約系3ファイル4箇所（§4）も同じく `provisionTarget` で振り分け。**ここの分岐漏れが最も危険**（解約が別アプリに飛ぶ）。

### テスト時の鉄則
- **本番の既存在庫顧客の注文番号では絶対にテストしない**（在庫連携で過去に状態衝突した教訓）。GPSテストは専用のテスト注文・テストemailのみ。

---

## 4. EC側 実装（GPSエージェントが担当・別途着手）
`EC_SUBSCRIPTION_INTEGRATION_DESIGN.md` §4 の通り。要点:
- `Product.provisionTarget`（'inventory'/'gps'）新設
- `gpsProvisionService.ts` 新設（`inventoryProvisionService.ts` 雛形・env `GPS_API_KEY`/`GPS_API_BASE_URL`・PlanLimits除去）
- 発行分岐 `orderController.ts`（1関数で4経路カバー）
- 解約系3ファイル4箇所（`subscriptionController.ts:51,84` / `stripeWebhookController.ts:247` / `adminProductController.ts:770`）に分岐 ← 漏れ注意

---

## 5. 本番適用の注意（⚠️ migration手動）
- GPS本番Cloud Runは**起動時にmigrateしない**。本番イメージにprisma CLIも無い。
- `SubscriptionGrant` 追加は **デプロイ前に、開発機から本番DATABASE_URLに対し `cd backend && npm run migrate:deploy` を手動実行** → その後コンテナをデプロイ。
- 本番適用・デプロイは**ユーザー承認後**に実施（今回の実装範囲は「コード+migrationファイル作成」まで）。

---

## 6. 実装順序
1. ✅ シークレット発行・PW保存（完了）
2. 本仕様の確定（本書）→ 両エージェントに共有
3. GPS受け口実装（§3、migrationファイル作成まで）＋ローカル型チェック
4. EC側分岐実装（§4）
5. 鍵を両端envに設定 → `x-integration-key` でcurl疎通 → provision→個人計測解放をE2E
6. 解約・再開・プラン変更の分岐を検証（本番の既存顧客は叩かない）
