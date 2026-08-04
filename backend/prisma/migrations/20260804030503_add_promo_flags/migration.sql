-- AlterTable
ALTER TABLE "events" ADD COLUMN     "is_promo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_promo" BOOLEAN NOT NULL DEFAULT false;
