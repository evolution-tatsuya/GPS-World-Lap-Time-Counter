# GPS⇄EC サブスク連携 やり取り記録（EC側実装完了）

- 記録日: 2026-10-13
- 目的: GPSラップタイマーをECプラットフォームのサブスク連携に接続する件の、三者（GPSエージェント / 在庫管理エージェント / ECエージェント）のやり取りと合意事項の記録。
- EC側実装: ブランチ `feat/gps-subscription-integration`（ECリポジトリ `~/Downloads/ショッピングページ〜決済ページ/`）。コミット `f2e991b` + `d615fb6`。

---

## 1. 役割分担（確定）

| 担当 | 役割 |
|---|---|
| GPSエージェント | GPS側 `/api/integration` 受け口の実装（完了済み・ブランチ feat/ec-subscription-integration） |
| ECエージェント | EC側の連携先切替・GPS専用サービスの実装（本記録の対象・完了） |
| 在庫管理エージェント | 既存連携の参照元（無改修） |

最重要制約: **在庫管理とGPSの連携を混在させない**（鍵・ルート・サービスを使い回さず、GPSは同じ動きを独立実装）。

---

## 2. 合意したデータ契約（EC→GPS）

共有シークレット: パスワードマネージャー `GPS-EC-Integration-Key`（64文字hex・在庫用と別値）。
EC側env `GPS_API_KEY` / GPS側env `GPS_INTEGRATION_API_KEY` に同一値。
GPS本番URL: `https://gps-lap-timer-563027052499.asia-northeast1.run.app`（EC側env `GPS_API_BASE_URL`）。

```
provision:    { orderId*, email*, plan*(personal|organizer), billingType?, productId?, features?, until? }
plan-change:  { orderId*, plan?, billingType?, productId?, features?, until? }
suspend:      { orderId*, reason? }
unsuspend:    { orderId* }
reactivate:   { prevOrderId*, newOrderId*, plan?, billingType?, productId?, features?, until? }
```

- `plan`: `personal`（個人仕様）/ `organizer`（イベント運営）。GPSは大小文字どちらも受理。
- `features`: 個人=`["personal_measurement"]` / 運営=`["event_hosting"]`（将来 `live_streaming` 追加）。
- `until`: 契約期限 ISO日付（= EC `Subscription.nextBillingDate`）。null=無期限。**provisionにも含める**（GPS側対応済み）。
- **在庫の `limits`（maxParts/maxImageMB/maxUsers）は送らない。**
- 冪等キー: GPS側は `(orderId × plan)` 複合。同一注文の系統違いは別契約、同一注文＋同一系統の再送のみ冪等。
- suspend/unsuspend: GPS側は「同一注文の全契約をまとめて操作」。

---

## 3. EC側実装の要点（完了）

- `Product.provisionTarget`（'inventory'|'gps'）と `planCode`（'personal'|'organizer'）を新設。
- `gpsProvisionService.ts` を新規作成（在庫サービスを import/共有しない完全独立。鍵・URL・型がGPS専用）。
- 全5連携点で `provisionTarget` 分岐（発行 / suspend / unsuspend / Stripe解約suspend / plan-change）。
  - **`provisionTarget` 未設定時は在庫にフォールバックせずスキップ**（混在事故を構造的に排除）。
- 商品作成/更新で `provisionTarget`/`planCode` を受け取り保存（不正値はnull化）。
- GPSには `limits` を送らず `plan`/`until`/`features` を送信。
- 独立レビュー実施済み: **混在経路ゼロ**。重大指摘なし（Low3件は対応 or 仕様確認）。

### EC側からGPS側への確認事項（1件・コード変更不要）
- reactivate ペイロードに `email` を含めていません（指定仕様準拠）。GPS側が reactivate 時に顧客突合で `email` を要求しないか念のため確認してください。要求する場合はEC側で追加します。

---

## 4. 本番適用手順（ユーザー承認後に実施）

1. 本番DBで既存サブスク商品を確認: `SELECT id, name FROM products WHERE product_type='subscription';`
2. 本番migration適用: `provision_target` / `plan_code` カラム追加（`npx prisma migrate deploy` または既存のdb push運用に合わせる）。
3. **既存の在庫サブスク商品すべてに `provision_target='inventory'` を設定**（null放置は発行スキップ＝既存契約のsuspend等が止まるため必須）。
4. GPSサブスク商品を登録（`provision_target='gps'`、`plan_code='personal'|'organizer'`、系統×価格ごとに別Product）。
5. 本番env（`backend/deploy-env.yaml`）に `GPS_API_KEY`（=GPS-EC-Integration-Key の値）と `GPS_API_BASE_URL` を追加してデプロイ。
6. Stripeテストモードで疎通: テスト注文番号・テストemailで provision を実行し、冪等挙動を確認:
   - 1回目: `alreadyProvisioned:false`
   - 同一orderId＋同一plan再送: `alreadyProvisioned:true`
   - 同一orderId＋別plan: 別Grant作成（カート同時契約）
   - ※本番の既存在庫顧客データは一切使わない。
