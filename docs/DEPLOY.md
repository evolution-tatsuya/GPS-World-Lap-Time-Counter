# デプロイ手順書 — GPS World Lap Time Counter

本番デプロイの手順をまとめる。構成は **同一オリジン統合**（1つの Cloud Run コンテナで
Express が API とビルド済み React を同一ドメインで配信）。

## なぜ同一オリジン統合か

- スマホ（**iPhone / Android 両対応**）中心のアプリで、ログインは Cookie セッション。
- フロントとAPIが同じドメインなら Cookie は**ファーストパーティ**になり、
  iOS Safari・Android Chrome のどちらでも確実に動く（サードパーティCookie制限の影響を受けない）。
- 実測: 本番モードで `Set-Cookie: ...; HttpOnly; Secure; SameSite=Lax` を確認済み。
- 別ドメイン構成（Vercel + Cloud Run）だとクロスサイトCookieになり iOS で弾かれるリスクがある。

## 構成図

```
[iPhone / Android ブラウザ or PWA]
        │  HTTPS
        ▼
  Cloud Run（1コンテナ / Dockerfile）
   ├─ GET /            → React 静的配信（frontend/dist）
   ├─ GET /ranking 等  → SPAフォールバック（index.html）
   └─ /api/*           → Express API
        │
        ▼
     Neon (PostgreSQL)  ← アプリデータ + セッション(user_sessionsテーブル)
```

## 本番で有効になる挙動（NODE_ENV=production）

| 項目 | 挙動 |
| --- | --- |
| `trust proxy` | 有効化（Cloud RunのTLS終端越しでも secure Cookie を発行できる） |
| Cookie `secure` | 有効（HTTPSのみ送信） |
| Cookie `sameSite` | `lax`（ファーストパーティ、iOS/Android両対応） |
| SESSION_SECRET | 未設定/デフォルトのままなら**起動を拒否**（セッション偽造防止） |
| セッションストア | PostgreSQL（`user_sessions`テーブル・自動作成）。複数インスタンスでも共有 |

---

## 1. ローカルで本番ビルドを確認する（デプロイ前チェック）

```bash
# フロントをビルド
cd frontend && npm ci && npm run build && cd ..

# バックエンドをビルド
cd backend && npm ci && npm run build && cd ..

# 本番モードで起動（同一ポートで API + フロントを配信）
cd backend
NODE_ENV=production \
DATABASE_URL="<Neon接続文字列>" \
SESSION_SECRET="<32文字以上のランダム値>" \
FRONTEND_DIST_PATH="$(pwd)/../frontend/dist" \
PORT=8080 \
node dist/index.js
```

確認:
- `http://localhost:8080/` → React が表示される
- `http://localhost:8080/ranking` を直接開く/リロード → SPAが表示される（404にならない）
- `http://localhost:8080/api/circuits` → JSONが返る
- `http://localhost:8080/health` → `{"status":"ok",...}`

> ローカルの http では `secure` Cookie がブラウザに保存されない（HTTPS必須）ため、
> ブラウザでのログイン確認は本番HTTPS（Cloud Run）か、`NODE_ENV` を外して行う。

---

## 2. Docker イメージをビルド（ローカル確認）

```bash
# リポジトリのルートで
docker build -t gps-lap-timer .

# ローカル起動（Cloud Runと同じくPORT=8080）
docker run --rm -p 8080:8080 \
  -e NODE_ENV=production \
  -e DATABASE_URL="<Neon接続文字列>" \
  -e SESSION_SECRET="<32文字以上のランダム値>" \
  gps-lap-timer
```

`FRONTEND_DIST_PATH` はイメージ内で `/app/backend/frontend-dist` に固定済み（指定不要）。

---

## 3. データベースのマイグレーション

本番DBにスキーマを適用する（**デプロイのたびに新しいマイグレーションがあれば実行**）。

```bash
cd backend
DATABASE_URL="<本番Neon接続文字列>" npx prisma migrate deploy
```

- `migrate deploy` は未適用のマイグレーションのみ適用（本番安全・対話なし）。
- `user_sessions`（セッション用）テーブルはアプリ起動時に自動作成される（別途操作不要）。
- 初回のみ、管理者アカウント等が必要なら `npm run seed`（seedの中身を本番向けに確認してから）。

---

## 4. Google Cloud Run へデプロイ

> 実行には GCP プロジェクトとログイン（`gcloud auth login`）が必要。
> 課金アカウントの有効化も必要（無料枠内でも有効化は求められる）。

```bash
# 事前: gcloud CLI ログイン & プロジェクト選択
gcloud auth login
gcloud config set project <PROJECT_ID>

# ソースから直接ビルド＆デプロイ（Cloud Build がDockerfileを使う）
gcloud run deploy gps-lap-timer \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-env-vars DATABASE_URL="<本番Neon接続文字列(pooled推奨)>" \
  --set-env-vars SESSION_SECRET="<32文字以上のランダム値>"
```

ポイント:
- `--region asia-northeast1`（東京）。ユーザーが日本中心なら近い方が速い。
- `--allow-unauthenticated`：一般公開アプリなので必要（アプリ内でログイン制御している）。
- Neon は**Pooled接続**（`-pooler`付きホスト）を使うと同時接続に強い。
- 機密値（DATABASE_URL / SESSION_SECRET）は本番運用では **Secret Manager** 推奨:
  ```bash
  echo -n "<値>" | gcloud secrets create session-secret --data-file=-
  gcloud run deploy gps-lap-timer --source . --region asia-northeast1 \
    --allow-unauthenticated \
    --set-env-vars NODE_ENV=production \
    --set-secrets SESSION_SECRET=session-secret:latest \
    --set-secrets DATABASE_URL=database-url:latest
  ```

デプロイ後に表示される URL（`https://gps-lap-timer-xxxx.a.run.app`）でアクセス確認。
スマホ（iPhone/Android両方）で: ログイン → 計測 → ランキング表示までを一度通す。

---

## 5. デプロイ後チェックリスト

- [ ] `https://<URL>/` でアプリが開く
- [ ] `https://<URL>/health` が ok を返す
- [ ] ログイン→リロードしてもログイン状態が保持される（pgセッションが効いている）
- [ ] iPhone Safari でログイン→計測→送信ができる
- [ ] Android Chrome でログイン→計測→送信ができる
- [ ] PWA として「ホーム画面に追加」ができ、単独起動する
- [ ] ランキングのベストラップが**アウトラップ(0ms)ではなく実タイム**になっている

---

## 補足

- **単体HTML版（`gps/`）は別運用**。これは GitHub Pages で公開している車載検証用で、
  今回のフルアプリ（Cloud Run）とは別物。実走テストは引き続き `gps/` を使ってよい。
- **決済（Stripe）は未連携**。課金の土台（サブスク状態の手動管理）は実装済みだが、
  実決済は料金プラン確定・事業者選定・利用規約・特商法表記とセットの事業判断のため保留中。
- 環境変数ファイル `.env` は**イメージに含めない**（`.dockerignore` で除外済み）。
  本番の秘密情報は Cloud Run の環境変数 / Secret Manager で注入する。
