-- User に車載カメラ利用可否フラグを追加（統括が運営ごとに切替）
ALTER TABLE "users" ADD COLUMN "camera_enabled" BOOLEAN NOT NULL DEFAULT false;
