# GPSアプリ ECサブスク連携 設計書

- 作成日: 2026-10-13
- 対象: GPSラップタイマー（`time logging/`）を、ECプラットフォームのサブスクリプション連携に接続する
- 方針: **在庫管理アプリと同じ連携規約を踏襲**し、GPSを「2つ目の連携先サービス」として追加する
- 課金単位: **ORGANIZERユーザー単位**（EC1契約 = GPSのORGANIZERユーザー1人）／突合キー: **`User.email`**
- 本書は実コード調査に基づく。各根拠は `file:line` で明示。実装はまだ行っていない（設計のみ）。

> ## ⚠️ 役割分担（食い違い防止・最重要）
> 現在3つのエージェントが同時進行中。実装の責任分界は以下で固定する。
>
> | 担当 | 役割 | 実装範囲 |
> |---|---|---|
> | **GPSエージェント** | **連携実装の主体** | GPS側 `/api/integration` 受け口（§3）**および** EC側の連携先切替分岐（§4）＝連携に関わる実装すべて |
> | 在庫管理エージェント | 既存連携の確認元 | 原則**無改修**。GPSが規約を複製するための参照元 |
> | 調査/設計担当（本書作成者） | 調査・設計図の提供のみ | **実装しない** |
>
> → EC側の改修（§4）も**GPSエージェントが実施する**。本書はそのための設計資料。他エージェントは実装に着手しないこと。

---

## 0. 登場するリポジトリ

| アプリ | パス | 役割 |
|---|---|---|
| EC本体 | `~/Downloads/ショッピングページ〜決済ページ/` | 販売・課金の**マスター**（送り手） |
| 在庫管理SaaS | `~/Downloads/在庫管理/` | 既存の連携先（受け手・参考実装） |
| **GPSアプリ** | **`~/Downloads/time logging/`** | 今回追加する連携先（受け手） |

> ⚠️ `~/Downloads/QRコード_GPSラップタイマー/` および `_新URL/` は **QR画像の配布フォルダでソースではない**。GPS本体は `time logging/`。GitHub: `evolution-tatsuya/GPS-World-Lap-Time-Counter`、本番 Cloud Run `gps-lap-timer-563027052499.asia-northeast1.run.app`。

---

## 1. 既存連携方式（EC ↔ 在庫管理）— これが踏襲すべき“契約”

```
┌─────────────┐  axios POST + header x-integration-key   ┌──────────────┐
│   EC本体     │ ────────────────────────────────────────▶ │  受け手アプリ   │
│ (販売・課金)  │  /api/integration/{provision,plan-change, │ (在庫管理/GPS) │
│  マスター     │   suspend,unsuspend,reactivate}          │   適用側       │
└─────────────┘                                          └──────────────┘
```

| 項目 | 仕様 | 根拠 |
|---|---|---|
| 方式 | サーバー間 REST push（axios・一方向）。共有DB/キュー/ポーリングではない | EC `backend/src/services/inventoryProvisionService.ts:71` |
| 受け口 | `POST /api/integration/{provision, plan-change, suspend, unsuspend, reactivate}` + `usage-snapshot`(pull) | 在庫 `backend/src/routes/integration.ts:17-32` |
| 認証 | ヘッダ `x-integration-key` を受け手が `crypto.timingSafeEqual` で定数時間比較、未設定時は**503フェイルクローズ** | 在庫 `backend/src/middleware/requireIntegration.ts:13-28` |
| 冪等キー | EC注文番号 `Order.orderNumber`。受け手は `provisionOrderId @unique` で突合し二重発行防止 | EC `orderController.ts:968` / 在庫 `schema.prisma:35`,`tenantService.ts:524` |
| 責務分担 | EC=「いつ発行してよいか（入金判断）」／受け手=「何を発行するか（キー生成・冪等管理）」 | EC `inventoryProvisionService.ts:6-8` |
| 利用権の実体 | 専用テーブルなし。EC側=`Subscription`行、在庫側=`Tenant`行に統合 | EC `schema.prisma:278` / 在庫 `schema.prisma:20` |

### 共有シークレットの“名前違い・同値”に注意
- EC側 env名: **`INVENTORY_API_KEY`**（送信時 `x-integration-key` ヘッダに載せる）
- 在庫側 env名: **`INTEGRATION_API_KEY`**（受信時に照合）
- → **名前は違うが同じランダム値**を両端に設定して成立する。GPSも同じ構造になる（下記 §4）。

---

## 2. GPSアプリの現状（受け皿は8割完成済み）

| 要素 | 状態 | 根拠 |
|---|---|---|
| 技術 | Express 5 + Prisma 7 (PostgreSQL/Neon) + React 19。フロント/バック/DB完備 | GPS `backend/package.json`, `backend/prisma/schema.prisma` |
| 認証 | express-session（Cookie、Postgres保存）。bcrypt。JWTではない | GPS `index.ts:67-85`, `auth.ts:238` |
| ロール | `DRIVER` / `ORGANIZER` / `ADMIN` | GPS `schema.prisma:42-46` |
| サブスク土台 | `User.subscriptionPlan/Status/Until`・`isPromo` 実装済み（migration適用済み） | GPS `schema.prisma:21-30` |
| 利用権判定 | `canUsePaidFeatures()`（isPromo優先→status=ACTIVE かつ 期限内） | GPS `utils/subscription.ts:17-22` |
| 課金ゲート | 個人計測APIで未課金は**HTTP 402** | GPS `routes/laps.ts:91-104` |
| 手動設定API | `PUT /api/admin/users/:id/subscription`（コメントに「将来Stripe Webhookで更新」） | GPS `routes/admin.ts:334-371` |
| **欠けているもの** | **連携Webhook受け口＋`x-integration-key`検証ミドルウェア（ヘッダ認証の実装が皆無）** | GPS `src`配下に `req.header` 参照ゼロ |

**結論**: GPSは「受け口を足して `subscriptionStatus='ACTIVE'` を立てるだけ」で、既存の402ゲートがそのまま効く。ゼロからではなく**空き口に差し込む**作業。

### Enum の取りうる値（GPS）
- `SubscriptionPlan`: `NONE / PERSONAL / ORGANIZER`（`schema.prisma:48-52`）
- `SubscriptionStatus`: `INACTIVE / ACTIVE / EXPIRED`（`schema.prisma:54-58`）← **pending相当の値は無い**

---

## 3. 【GPS側】実装設計（`/api/integration` 受け口の新設）

### 追加ファイル
**(A) `backend/src/middleware/integrationAuth.ts`（新規）**
- `requireIntegrationKey(req,res,next)`: `req.header('x-integration-key')` と `process.env.GPS_INTEGRATION_API_KEY` を照合
- 鍵未設定→**503**（既存の `livekit.ts:21-27` の null→503 パターンに倣う）／不一致→**401**
- 比較は Node標準 `crypto.timingSafeEqual`（追加依存不要。長さ一致を先に確認してから比較）
- 既存 `middleware/auth.ts` と同じ `(req,res,next):void` シグネチャ。`req.session` には依存しない独立ミドルウェア

**(B) `backend/src/routes/integration.ts`（新規）**
- `router.use(requireIntegrationKey)` で全ルート保護。`import { prisma } from '../index'`
- email は必ず **`trim().toLowerCase()` で正規化**（既存 `admin.ts:35` 流儀。login/register が未正規化な不整合に飲まれないため）
- 5エンドポイント（在庫管理と同形）:

| エンドポイント | 処理（GPSは User単位） |
|---|---|
| `POST /provision` | `prisma.user.upsert({ where:{email}, create:{ email, name, role:'ORGANIZER', passwordHash:null, subscriptionStatus:'ACTIVE', subscriptionPlan:'ORGANIZER', subscriptionUntil }, update:{ subscriptionStatus:'ACTIVE', subscriptionPlan:'ORGANIZER', subscriptionUntil } })` |
| `POST /suspend` | email検索 → `update({ subscriptionStatus:'INACTIVE' })`（データ保持） |
| `POST /unsuspend` | email検索 → `update({ subscriptionStatus:'ACTIVE' })`（+ until延長） |
| `POST /reactivate` | 旧email→新emailの付け替え or `ACTIVE`復帰（契約仕様に合わせる） |
| `POST /plan-change` | `update({ subscriptionPlan, subscriptionUntil })`。plan値は `admin.ts:342` のホワイトリスト検証を流用 |

- 更新ロジックは **`admin.ts:340-357` をほぼ複製**（plan/statusホワイトリスト、until→`new Date()`/null変換）。違いは `where:{id}` → `where:{email}` と upsert化のみ

**(C) 冪等キーの保持先（要・スキーマ追加）**
- GPSにはテナントテーブルが無い。冪等性のため **`User` に `provisionOrderId String? @unique` 相当を追加**（migration要）、もしくは連携専用テーブルを新設
- これにより同じ注文番号の再送を二重処理しない（在庫 `Tenant.provisionOrderId @unique` に相当）

### 改修する既存ファイル（最小）
**(D) `backend/src/index.ts`**
- import追加（`index.ts:23`付近）: `import integrationRoutes from './routes/integration';`
- 登録追加（`index.ts:105` の直後）: `app.use('/api/integration', integrationRoutes);`
- `express.json()` はグローバル（`index.ts:59`）。**`x-integration-key` 方式なら raw body 不要でそのままJSON parseでOK**（HMAC署名方式に変えるならintegrationルートだけ `express.raw()` を先に噛ませる差し替えが必要）
- SPAフォールバック（`index.ts:119`）は `/api/` を除外するため干渉なし

**(E) `backend/.env.example` / `.env.local` / `.env`**
- `GPS_INTEGRATION_API_KEY="..."` を追記（`.env.example` は SESSION_SECRET と同様の説明コメント付き）

### 2段階アクティベーションは不要（GPSは即時有効化が自然）
- 在庫管理は「provision=pending発行 → 本人が `/activate?key=` で有効化」の2段階だが、**GPSは `User.email` が契約キー＝本人確定**なので2段階は冗長。`SubscriptionStatus` に pending値も無い（enum追加migrationが必要になり侵襲的）
- → provision時に `subscriptionStatus='ACTIVE'` を即時に立てる方式を推奨
- **新規email（GPS未登録の契約者）のケア**: upsertで `passwordHash:null` の ORGANIZER を即作成。ただしパスワード未設定だと本人は `login` 不可（`auth.ts:171`）。別問題として「初回パスワード設定の導線」が必要:
  - 当面は ADMIN 代理設定 `PUT /api/admin/users/:id/password`（`admin.ts:178-199`）
  - または招待メール+パスワード設定エンドポイント新設（※現状メール送信依存が無いため後日）

### 注意（GPS側の設計判断ポイント）
- `canUsePaidFeatures()` は `status/until/isPromo` のみ見ており **`subscriptionPlan` は未使用**（`subscription.ts`）。PERSONAL/ORGANIZERで権限差を付けたい場合はこの関数の改修が別途必要
- `User.email` は nullable unique、`passwordHash` も nullable → EC先行作成は**スキーマ上問題なく可能**

---

## 4. 【EC側】実装設計（連携先の切り替え分岐を追加）

### 現状の制約
- EC側の連携サービス `inventoryProvisionService.ts` は**在庫アプリ専用**（URL・キー・`PlanLimits` 型がハードコード）
- 発行オーケストレーション `provisionAndDeliverForOrder`（`orderController.ts:918`）は **連携先の商品種別判定を持たず**、「activeなサブスク契約=全て在庫へ送る」前提（`orderController.ts:928`）
- Product に連携先を区別するフィールドが**無い**（在庫もGPSも `productType='subscription'`、`schema.prisma:97`）

### 改修ファイル一覧

| 対象 | ファイル:行 | 改修内容 |
|---|---|---|
| 連携先識別子 | EC `prisma/schema.prisma` L109付近（Product） | 新フィールド `provisionTarget String?`（`'inventory'`/`'gps'`）追加 + migration |
| GPSサービス新設 | EC `src/services/gpsProvisionService.ts`（新規） | `inventoryProvisionService.ts` を雛形に、URL/KEYを `GPS_API_BASE_URL`/`GPS_API_KEY` 参照へ。**在庫の `PlanLimits`（maxParts/maxImageMB/maxUsers）はGPSに流用不可** → GPS課金単位に合わせRequest型を再設計 |
| 発行分岐 | EC `src/controllers/orderController.ts` L931-976 | ループ内で `sub.product.provisionTarget` により `provisionTenant`(在庫)/GPS関数を選択。L936-940のlimits・L943のfeatures構築もGPS用に分岐 |
| 解約/再開分岐 | EC `src/controllers/subscriptionController.ts` L32-94 | `suspendInventoryForSubscription`/`unsuspend` を連携先で分岐 |
| Stripe解約分岐 | EC `src/controllers/stripeWebhookController.ts` L247 | `onSubscriptionDeleted` の `suspendTenant` を連携先で分岐 |
| プラン変更分岐 | EC `src/controllers/adminProductController.ts` L744-787 | `changePlan` 呼び出しを連携先で分岐（limits判定も） |
| env | EC `.env.example` L35付近 / `deploy-env.yaml` / `env.yaml` | `GPS_API_KEY` / `GPS_API_BASE_URL` 追記 |
| 管理画面入力 | EC `adminProductController.ts` 作成L423-434/更新L716-726 | `provisionTarget` の受け取り・保存 |

### 設計上の利点と落とし穴
- ✅ **発行は `provisionAndDeliverForOrder` の1関数に集約**。呼び出し側4経路（createOrder `L339` / confirmPayment `L1113` / Stripe Webhook `stripeWebhookController.ts:112,169`）は改修不要。GPS分岐をこの1関数に入れれば全経路が自動対応
- ⚠️ **落とし穴: 解約・再開・プラン変更は集約されておらず3ファイルに散在**（`subscriptionController.ts` / `stripeWebhookController.ts` / `adminProductController.ts`）。ここの分岐追加を漏らすと、GPS契約に在庫APIが誤って飛ぶ

---

## 5. 三者で合意すべき“1本の鍵”とデータ契約

### 共有シークレット（1本）
GPS連携用に**同一のランダム値**を両端に設定:
- EC側 env: `GPS_API_KEY`
- GPS側 env: `GPS_INTEGRATION_API_KEY`

（在庫の `INVENTORY_API_KEY`↔`INTEGRATION_API_KEY` と同じ構造）

### provisionリクエストのデータ契約（EC→GPS）
在庫の `ProvisionRequest`（`inventoryProvisionService.ts:22-30`）を基に、GPS向けに調整:
- `orderId`（冪等キー＝`Order.orderNumber`）… **必須・両者合意必須**
- `email`（突合キー・GPS側で `trim().toLowerCase()` 正規化）… **必須**
- `plan` / `billingType` / `productId`
- `limits`: **在庫の3項目は使わない**。GPSで制限する指標があれば再定義、無ければ省略
- `features[]`: GPS固有の機能キーに差し替え（在庫の `stocktake/csv_import/...` は不適）

### 戻り値（GPS→EC）
在庫の `ProvisionResult`（`slug/licenseKey/activationUrl/alreadyProvisioned/status`）に準拠。GPSは即時有効化のため `licenseKey/activationUrl` の意味は薄く、`success` と冪等フラグが主。EC側 `Subscription` への保存先（`licenseKey/activationUrl/tenantSlug/provisionedAt`、`orderController.ts:1004-1012`）に合わせて何を返すか要合意。

---

## 6. 実装順序（推奨）

1. **鍵の発行・共有**: `GPS_API_KEY`/`GPS_INTEGRATION_API_KEY` に同一値を両端env・本番env(`deploy-env.yaml`/Cloud Run)へ設定
2. **GPS側 受け口実装**（§3のA〜E）→ `x-integration-key` でcurl疎通 → `subscriptionStatus=ACTIVE`で402ゲート通過をE2E確認
3. **EC側 分岐実装**（§4）→ `Product.provisionTarget='gps'` のテスト商品を作り、Stripe/手動両ルートで provision が GPS に飛ぶことをE2E確認
4. **解約・再開・プラン変更の分岐**（§4の落とし穴）を漏れなく実装・検証
5. **多角的精査**: Playwright E2E（購入→有効化→計測可能／解約→402復帰）で動作保証

---

## 付録: 根拠ファイル早見表

- EC 連携サービス: `~/Downloads/ショッピングページ〜決済ページ/backend/src/services/inventoryProvisionService.ts`
- EC 発行集約点: `.../backend/src/controllers/orderController.ts:918`（`provisionAndDeliverForOrder`）
- EC データモデル: `.../backend/prisma/schema.prisma`（Product:88 / Subscription:278）
- 在庫 受け口: `~/Downloads/在庫管理/backend/src/routes/integration.ts` / `controllers/integrationController.ts` / `services/tenantService.ts`
- 在庫 認証: `~/Downloads/在庫管理/backend/src/middleware/requireIntegration.ts`
- GPS 本体: `~/Downloads/time logging/backend/`（`index.ts` / `routes/admin.ts` / `routes/laps.ts` / `utils/subscription.ts` / `prisma/schema.prisma` / `middleware/auth.ts`）
