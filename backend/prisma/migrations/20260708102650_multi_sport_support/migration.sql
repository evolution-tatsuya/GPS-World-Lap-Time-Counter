/*
  Warnings:

  - You are about to drop the column `circuit_id` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `driver_name` on the `laps` table. All the data in the column will be lost.
  - You are about to drop the column `vehicle` on the `laps` table. All the data in the column will be lost.
  - You are about to drop the `circuits` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `course_id` to the `events` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sport_category` to the `events` table without a default value. This is not possible if the table is not empty.
  - Added the required column `participant_name` to the `laps` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sport_category` to the `laps` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CourseType" AS ENUM ('CLOSED_CIRCUIT', 'PUBLIC_ROAD', 'FARM_ROAD', 'TRAIL', 'WATER', 'OTHER');

-- CreateEnum
CREATE TYPE "SportCategory" AS ENUM ('CAR', 'MOTORCYCLE', 'KART', 'BICYCLE_ROAD', 'BICYCLE_MTB', 'BICYCLE_CYCLOCROSS', 'RUNNING', 'RUNNING_MARATHON', 'RUNNING_TRAIL', 'SKIING', 'SNOWBOARDING', 'BOAT', 'CANOE', 'OTHER');

-- DropForeignKey
ALTER TABLE "circuits" DROP CONSTRAINT "circuits_created_by_fkey";

-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_circuit_id_fkey";

-- DropIndex
DROP INDEX "events_circuit_id_idx";

-- AlterTable
ALTER TABLE "events" DROP COLUMN "circuit_id",
ADD COLUMN     "course_id" TEXT NOT NULL,
ADD COLUMN     "sport_category" "SportCategory" NOT NULL;

-- AlterTable
ALTER TABLE "laps" DROP COLUMN "driver_name",
DROP COLUMN "vehicle",
ADD COLUMN     "participant_name" TEXT NOT NULL,
ADD COLUMN     "sport_category" "SportCategory" NOT NULL,
ADD COLUMN     "vehicle_or_gear" TEXT;

-- DropTable
DROP TABLE "circuits";

-- DropEnum
DROP TYPE "CircuitType";

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "state" TEXT,
    "name" TEXT NOT NULL,
    "course_type" "CourseType" NOT NULL DEFAULT 'CLOSED_CIRCUIT',
    "sport_categories" JSONB NOT NULL,
    "control_line_a_lat" DECIMAL(10,7) NOT NULL,
    "control_line_a_lng" DECIMAL(10,7) NOT NULL,
    "control_line_b_lat" DECIMAL(10,7) NOT NULL,
    "control_line_b_lng" DECIMAL(10,7) NOT NULL,
    "reference_time" INTEGER,
    "course_length" DECIMAL(5,2),
    "elevation_gain" INTEGER,
    "description" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courses_country_state_idx" ON "courses"("country", "state");

-- CreateIndex
CREATE UNIQUE INDEX "courses_country_state_name_key" ON "courses"("country", "state", "name");

-- CreateIndex
CREATE INDEX "events_course_id_idx" ON "events"("course_id");

-- CreateIndex
CREATE INDEX "events_sport_category_idx" ON "events"("sport_category");

-- CreateIndex
CREATE INDEX "laps_sport_category_idx" ON "laps"("sport_category");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
