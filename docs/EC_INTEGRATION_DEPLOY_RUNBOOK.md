# EC連携 本番適用 手順書（Runbook）

- 対象: GPSラップタイマー backend に追加した EC連携受け口（`/api/integration/*`）を本番で有効化する
- 前提: PR #12 がレビュー・マージ済み、EC側(PR #1)も本番準備が整っていること
- 原則: **各ステップでユーザー承認を取りながら進める。不可逆操作（本番DB変更・デプロイ）は特に慎重に。**
- ⚠️ 本番DBは手動migration運用（Cloud Run起動時に自動migrateしない）。prisma CLIは本番イメージに無い。

---

## 事前チェック（実行前に必ず確認）

- [ ] PR #12 がmainにマージ済み
- [ ] 本番の現状が正常（`curl https://gps-lap-timer-563027052499.asia-northeast1.run.app/health` が ok）
- [ ] PWマネージャ `GPS-EC-Integration-Key` の値を取得できる（EC側 `GPS_API_KEY` と同一値）
- [ ] 本番DBのバックアップ or Neonの復元ポイントを確認（Neonは自動で復元可能・時刻を控える）

---

## Step 1: 本番DBへ migration 適用（`subscription_grants` テーブル作成）

⚠️ 本番DBに対してスキーマ変更を行う。**追加のみ（既存テーブル・データは変更しない）**なので安全側だが、不可逆。

```bash
cd ~/Downloads/time\ logging/backend

# 1-1. 本番DATABASE_URLを確認（.env が本番Neonを指している）
#      ※ 専用の一時シェル変数で明示する方が安全
#      DATABASE_URL="postgresql://neondb_owner:***@ep-wild-brook-...neon.tech/..."

# 1-2. 適用予定のmigrationを確認（未適用のものだけ出る）
npx prisma migrate status

# 1-3. 本番へ適用（migrate deploy は未適用migrationのみ順に流す・shadow DB不要）
npm run migrate:deploy
```

- 期待結果: `20261013120000_add_subscription_grants` が適用され、`subscription_grants` テーブルが作成される。
- 検証: `npx prisma migrate status` で「Database schema is up to date」。
- ロールバック: 問題時は `DROP TABLE subscription_grants;`（他テーブルに影響しない・FKは users への参照のみ）。

**承認ポイント①**: migration適用の実行前にユーザー確認。

---

## Step 2: 本番 Cloud Run に連携キーを設定

⚠️ env変更はCloud Runの新リビジョンを作る。**既存のSecret由来env（DATABASE_URL/SESSION_SECRET/LIVEKIT_*）を消さないよう、`--update-env-vars` を使う**（`--set-env-vars` は全置換なので使わない）。

```bash
# 値はPWマネージャ GPS-EC-Integration-Key から取得（チャットに貼らない）
gcloud run services update gps-lap-timer \
  --project gps-lap-timer-2026 --region asia-northeast1 \
  --update-env-vars GPS_INTEGRATION_API_KEY="＜PWマネージャの値＞"
```

- 検証（鍵設定前は503、設定後は認証が効く）:
  ```bash
  BASE="https://gps-lap-timer-563027052499.asia-northeast1.run.app"
  # 鍵なし → 401（設定済みなら。未設定時は503）
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/integration/provision" -H "Content-Type: application/json" -d '{}'
  ```

**承認ポイント②**: env更新の実行前にユーザー確認。

> 注: Step 2は「新コードがデプロイされた後」でないと `/api/integration` 自体が存在しない。実務上は **Step 3（デプロイ）→ Step 2（鍵設定）** の順、またはデプロイ時に同時設定でもよい。キー未設定の間は503で安全に閉じている。

---

## Step 3: 本番デプロイ（連携コードを反映）

```bash
cd ~/Downloads/time\ logging
# mainにマージ済みの状態でデプロイ（env保持のため --set-env-vars は付けない）
gcloud run deploy gps-lap-timer --source . \
  --project gps-lap-timer-2026 --region asia-northeast1
```

- 検証:
  ```bash
  BASE="https://gps-lap-timer-563027052499.asia-northeast1.run.app"
  curl -s "$BASE/health"   # production ok
  # /api/integration が存在する（鍵なしで401 or 503が返る＝ルートが生きている）
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/integration/provision"
  ```

**承認ポイント③**: デプロイ実行前にユーザー確認。

---

## Step 4: 疎通テスト（Stripeテストモード・本番の既存顧客は触らない）

⚠️ **鉄則: テスト専用の注文番号・テストemailのみ。本番の既存在庫顧客のorderId/emailは絶対に使わない。**

EC側（ECエージェント）と協調して実施:

1. EC側で `provisionTarget='gps'`・`planCode='personal'` のテスト商品をStripeテストモードで購入
2. GPSに `provision` が飛び、`SubscriptionGrant` が ACTIVE で作られることを確認:
   ```sql
   SELECT provision_order_id, plan, status, until FROM subscription_grants WHERE ec_product_id = '＜テスト商品＞';
   ```
3. そのemailでGPSにログイン→個人計測が **402にならず通る** ことを確認
4. 冪等確認: 同一orderId+同一planの再送で `alreadyProvisioned:true`
5. カート確認: 同一orderId+別plan（organizer）で別Grant作成
6. 解約: EC側でキャンセル→`suspend`→GPSで個人計測が **402に戻る**
7. 再開: `unsuspend`→再び通る

**承認ポイント④**: テスト実施の段取りをユーザー・EC側と合意。

---

## Step 5: 本番販売開始前の最終確認

- [ ] 既存在庫商品すべてに `provisionTarget='inventory'` が設定されている（EC側・混在防止）
- [ ] GPS商品の価格・特商法表記・税処理
- [ ] 未課金→402、課金→解放、解約→402復帰 がE2Eで確認済み
- [ ] 本人ログイン導線（provision後のパスワード設定）の運用（当面ADMIN代理 or 招待メール）

---

## 付録: DB統合テストの実行（本番適用前の推奨）

連携ロジックのDB統合テストを `backend/src/services/integrationService.test.ts` に用意済み。
**本番DB誤爆防止のため `TEST_DATABASE_URL` を明示した時だけ実行**される（未設定なら全スキップ）。

テスト用DBの用意（どちらか）:
- **Neonブランチ（推奨）**: Neon管理画面で本番DBの「ブランチ」を作成 → その接続文字列を使う（本番スキーマ・データのコピーで安全に隔離）
- ローカル Docker PostgreSQL を立てる

```bash
cd ~/Downloads/time\ logging/backend
export TEST_DATABASE_URL="postgresql://.../gps_test"   # テスト専用DB（本番とは別）
# テストDBにスキーマを適用
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
# テスト実行（provision冪等/2系統/until/suspend・unsuspend/reactivate/hasActiveGrant を検証）
npm test
```

→ 全テスト緑を確認してから Step 1 の本番適用に進むのが安全。

---

## 付録: ロールバック手順
- 連携だけ止めたい: Cloud Runのenv `GPS_INTEGRATION_API_KEY` を削除 → `/api/integration/*` が503で全拒否（既存機能に影響なし）
- テーブルごと戻す: `DROP TABLE subscription_grants;`（usersへのFK参照のみ・他に影響なし）
- デプロイを戻す: 前リビジョンにトラフィックを戻す `gcloud run services update-traffic gps-lap-timer --to-revisions=＜前リビジョン＞=100`
