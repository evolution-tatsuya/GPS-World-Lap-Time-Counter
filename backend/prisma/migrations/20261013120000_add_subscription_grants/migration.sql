-- EC連携のサブスク契約テーブル（1行=1契約）。
-- GPSは個人仕様(PERSONAL)とイベント運営(ORGANIZER)を同時契約できるため、
-- User単一フィールドでなくこのテーブルに複数ぶら下げる。冪等キーは provision_order_id。
-- enum SubscriptionPlan / SubscriptionStatus は既存(20260804120506_add_subscription_fields)を再利用。

-- CreateTable
CREATE TABLE "subscription_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provision_order_id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "until" TIMESTAMP(3),
    "billing_type" TEXT,
    "ec_product_id" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_grants_provision_order_id_key" ON "subscription_grants"("provision_order_id");

-- CreateIndex
CREATE INDEX "subscription_grants_user_id_idx" ON "subscription_grants"("user_id");

-- CreateIndex
CREATE INDEX "subscription_grants_plan_status_idx" ON "subscription_grants"("plan", "status");

-- AddForeignKey
ALTER TABLE "subscription_grants" ADD CONSTRAINT "subscription_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
