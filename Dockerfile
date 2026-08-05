# GPS World Lap Time Counter — 本番用 Dockerfile（同一オリジン統合構成）
# 1つのコンテナで Express が API と ビルド済み React を配信する。
# Cloud Run 等にそのままデプロイ可能。

# ========== Stage 1: フロントエンドをビルド ==========
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# VITE_API_URL は同一オリジン配信なので /api（デフォルト）でOK
RUN npm run build

# ========== Stage 2: バックエンドをビルド（tsc） ==========
FROM node:22-slim AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
COPY backend/prisma.config.ts ./
RUN npm ci
COPY backend/ ./
# Prisma Client 生成 → TypeScript コンパイル
RUN npx prisma generate && npm run build

# ========== Stage 3: 本番ランタイム（最小） ==========
FROM node:22-slim AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production
# 本番依存のみインストール（prisma CLI は devDependency なのでここには入らない）
COPY backend/package*.json ./
RUN npm ci --omit=dev
# スキーマ・コンパイル済みJS・フロント成果物をコピー
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts ./
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=frontend-build /app/frontend/dist ./frontend-dist
# 生成済み Prisma Client を build ステージからコピー（runtimeでの generate 不要にする）。
# Prisma 7 は @prisma/client 配下に生成物を置くため、その実体を持ってくる。
COPY --from=backend-build /app/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=backend-build /app/backend/node_modules/@prisma/client ./node_modules/@prisma/client

# Express の静的配信先をコンテナ内の実パスに固定
ENV FRONTEND_DIST_PATH=/app/backend/frontend-dist

# Cloud Run は PORT を注入する（デフォルト8080）。アプリは process.env.PORT を尊重する。
ENV PORT=8080
EXPOSE 8080

# マイグレーションは起動前に別途 migrate:deploy を実行する運用（DEPLOY.md参照）。
# ここではアプリ起動のみ。
CMD ["node", "dist/index.js"]
