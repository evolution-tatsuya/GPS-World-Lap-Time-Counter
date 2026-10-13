# 個人仕様サブスク販売 — 現状調査＋EC連携 設計案

作成: 2026-10-13 / 目標: **年内（2026年内）に個人仕様をサブスク販売開始**
今日のスコープ: 現状調査と連携設計案まで（実装は次フェーズ）

---

## 0. 結論サマリー（忙しい人向け）

- **GPS側の「課金を受け入れる土台」はほぼ完成**している。データモデル・判定ロジック・個人計測のゲート（未課金は402でブロック）まで実装済み。
- **唯一にして最大の不足は「外部ECから権限を付与する受け口（連携API/Webhook）」が存在しないこと。** 現状はADMINが管理画面から手動でサブスク状態を更新する運用のみ。
- **ECは既に成熟した汎用販売基盤**。サブスク3段階（月/年）、Stripe決済、デジタルチケット（今日のイベント¥5,500も販売中）、物販まで稼働。決済は **Stripe**。
- **やるべきこと＝「ECで売れた」という事実をGPSに安全に伝え、該当ユーザーのサブスクを有効化する1本の連携線を作る**こと。これが年内販売の本丸。

---

## 1. GPS側（gps-lap-timer）の現状 — 調査結果

### 1-1. データモデル（`backend/prisma/schema.prisma`）
`User` に課金フィールドが揃っている:
| フィールド | 型 | 意味 |
|---|---|---|
| `isPromo` | Boolean | 課金免除（運営・プロモ枠）。trueなら常に有料機能可 |
| `subscriptionPlan` | enum `NONE/PERSONAL/ORGANIZER` | プラン種別（※現状、判定には未使用） |
| `subscriptionStatus` | enum `INACTIVE/ACTIVE/EXPIRED` | 課金状態 |
| `subscriptionUntil` | DateTime? | 有効期限（null=無期限） |

識別キー: **`User.id`（UUID, 確実）** / `email`（unique・小文字正規化）。

### 1-2. 判定ロジック（`backend/src/utils/subscription.ts`）
`canUsePaidFeatures(user)`:
1. `isPromo=true` → 無条件で可
2. `subscriptionStatus !== 'ACTIVE'` → 不可
3. `subscriptionUntil` が過去 → 不可
4. それ以外 → 可

→ ログイン/セッション応答に `canUsePaid` として同梱（フロントはこれを信頼）。
※ `subscriptionPlan`（PERSONAL/ORGANIZER）は**今は判定に使われていない**（有効/無効の二値のみ）。

### 1-3. 課金でゲートされている機能
現状サーバーで課金強制されているのは **「個人計測」= `POST /api/laps/personal`** のみ。未課金は **HTTP 402** で拒否（`laps.ts:101-104`）。
- フロント: `PersonalMeasurement.tsx` は未課金なら `/subscribe` へリダイレクト。
- ※「車載カメラ/配信」は別ゲート（`User.cameraEnabled`、ADMIN手動）で、サブスクとは無関係。

### 1-4. 現状の権限付与手段
- `PUT /api/admin/users/:id/subscription`（**ADMINセッションCookie必須**）で plan/status/until を手動更新。
- コードに「将来Stripe Webhookで更新」というプレースホルダ・コメントあり＝**連携は想定済みだが未実装**。
- **外部（EC→GPS）から叩ける認証付きの口は存在しない。** ここが不足点。

### 1-5. 購入導線
- `Subscribe.tsx` の購入ボタンは `disabled`（comingSoon）。外部ECへのリンク未配線。

---

## 2. EC側（ec-platform-backend）の現状 — 外部挙動からの調査結果

稼働URL: `https://ec-platform-backend-production-...run.app/api/*`（本番稼働中）

### 2-1. 確認できた商品ラインナップ
- **サブスク**: ベーシック / スタンダード / プロ × 月額・年額（¥3,980〜¥149,800）。`productType=subscription`。
  - 一部に実Stripe ID（`stripeProductId=prod_...`, `stripePriceId=price_...`）設定済み → **決済基盤はStripe**。
- **デジタルチケット**: `2026 TYPE R TOHOKU Convention ¥5,500`（`productType=DIGITAL_TICKET`）← 今日のイベントもECで販売済み。
- **物販**: オイルチャージャー、FD2ヘッドライト等（`productType=PHYSICAL`）。

※ 既存サブスク商品は「在庫管理アプリ プロプラン」等＝**在庫管理アプリが既存のEC連携アプリ**（ユーザー確認済み）。

### 2-2. 確認できたエンドポイント（外部挙動）
| エンドポイント | 状態 | 推定 |
|---|---|---|
| `GET /api/products` | 200 公開 | 商品一覧 |
| `GET /api/health` | 200 公開 | ヘルスチェック |
| `GET /api/subscriptions` | 401 要認証 | サブスク一覧 |
| `GET /api/orders` | 401 要認証 | 注文 |
| **`/api/subscriptions/verify`** | 401 要認証 | **課金状態の照会口（連携の核の可能性大）** |

→ EC本体のソースコードは今回の環境から未確認。**正確な連携仕様はEC/在庫管理の担当エージェントに要確認**（下記セクション4の質問リスト）。

---

## 3. 連携設計案（2パターン） — 年内販売に向けて

「別アプリ（在庫管理）と同じ方式を流用」が方針。在庫管理がどちらを採っているかで確定するが、一般に有力なのは次の2つ。

### パターンA: Webhook受信型（EC → GPS へ push）【堅牢・推奨】
```
[ユーザー] --購入--> [EC(Stripe決済)] --Webhook(署名付)--> [GPS新API: POST /api/webhooks/ec]
                                                              └→ emailかuser_idで該当Userを特定
                                                              └→ subscriptionStatus=ACTIVE, until=期限 を更新
[GPS] canUsePaidFeatures() が true に → 個人計測が解放
```
- GPS側に新規実装:
  1. `POST /api/webhooks/ec`（**APIキー or HMAC署名検証**、Cookie不要のサーバー間認証）
  2. 冪等処理（同じ購入イベントの再送で二重付与しない）
  3. email↔User.id の突合（未登録ユーザーの扱いルール）
  4. 失効（解約・期限切れ）の受信も同経路で
- メリット: リアルタイム反映・GPSが能動照会不要。在庫管理がこの型なら流用が最速。

### パターンB: 照会型（GPS → EC へ pull） 【`/api/subscriptions/verify` を使う想定】
```
[GPS] 個人計測の入口で --verify照会--> [EC: /api/subscriptions/verify] --課金状態--> [GPS]
```
- GPS側: 個人計測ゲート時にECへ問い合わせ、結果をキャッシュして `canUsePaid` に反映。
- メリット: GPSに受け口を作らず軽量。デメリット: EC障害時に判定不能・遅延。

> **どちらを採るかは「在庫管理アプリが実際どうしているか」で決める。** まずそれを確認（セクション4）。

### 3-1. いずれの場合もGPS側で必要になる共通作業
- [ ] EC↔GPSの**ユーザー紐付けキーの確定**（email一致が現実的 / または購入時にGPS User.idを引き渡す）
- [ ] 購入導線の配線: `Subscribe.tsx` の購入ボタン → ECの該当商品ページへ遷移（+識別子の受け渡し）
- [ ] （任意）`subscriptionPlan` 別の機能差別化を使うなら、plan分岐を `canUsePaidFeatures` に追加
- [ ] 期限切れの自動失効（日次ジョブ or verify時判定）
- [ ] 監査ログ（誰にいつ付与/失効したか）

---

## 4. EC/在庫管理の担当エージェントへの確認事項（これを聞けば設計が確定する）

### 在庫管理アプリ・エージェントへ
1. 在庫管理アプリは、ECでサブスク購入された後、**どうやって「課金済み」を知る**のか？ Webhook受信型 / ECへの照会型 / その他 のどれか。
2. その連携の**認証方式**は？（APIキー / HMAC署名 / OAuth / Bearerトークン 等）具体的なヘッダ名・署名方式。
3. ECから在庫管理へ渡される**ペイロードの形**（購入者の識別子は email か 独自ID か、プラン・期限・解約情報の項目）。
4. **ユーザーの紐付け**はどうやっている？（EC購入者と在庫管理ユーザーの対応付け方法）
5. 購入導線: 在庫管理アプリ内の「購入する」ボタンは**ECのどのURL/商品ページ**へ飛ばしているか。識別子をどう引き渡すか。
6. 解約・返金・期限切れ時の**失効フロー**はどうなっているか。

### ECサイト・エージェントへ
1. `POST` でアプリ側へ通知する**Webhook機能はあるか**？あればイベント種別・ペイロード・署名方式・再送仕様。
2. `/api/subscriptions/verify` は**何を入力に何を返す**か？（照会型連携の口か）認証方式は。
3. サブスク購入時、**特定アプリ（商品）への権限付与**をどう表現しているか（商品slug/categoryで区別？）。
4. GPSラップタイマー用の**新しいサブスク商品**を登録する手順（名称・価格・billingType・Stripe価格の作り方）。
5. 購入完了後に**アプリ側へリダイレクト**する仕組み（成功URL・識別子クエリ）はあるか。
6. 決済は**Stripe**で確定か。Stripe側のWebhook（`checkout.session.completed`等）をECが受けて各アプリへ中継する構成か。

---

## 5. 推奨ロードマップ（年内販売）

1. **【確認】** 上記セクション4をEC/在庫管理エージェントに確認し、**連携方式(A or B)と認証仕様を確定**する ← 次の一歩
2. **【EC】** GPS個人仕様のサブスク商品をECに登録（価格・プラン設計）
3. **【GPS実装】** 確定した方式で連携線を実装（Webhook受信口 or verify照会）＋冪等・失効・監査
4. **【GPS実装】** `Subscribe.tsx` の購入導線を配線（EC商品ページへ、識別子引き渡し）
5. **【検証】** テスト購入→GPSでACTIVE化→個人計測解放→解約で失効、までE2Eで確認（Stripeテストモード）
6. **【本番】** 価格・特商法表記・税処理を確認の上、販売開始

---

## 付記: 今日判明した関連事実
- GPS本番の正規URL: `https://gps-lap-timer-563027052499.asia-northeast1.run.app`（旧`47dqrrd2fa`は削除済み・使用禁止）。
- GPS側の個人仕様本体 = `frontend/src/pages/PersonalMeasurement.tsx`、購読導線 = `Subscribe.tsx`。
- 開発用運営アカウント（`*.gps-world.local`）はダミー。正式運用時に実在メールのアカウント整備が必要。
