-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('NONE', 'PERSONAL', 'ORGANIZER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'EXPIRED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "subscription_plan" "SubscriptionPlan" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
ADD COLUMN     "subscription_until" TIMESTAMP(3);
