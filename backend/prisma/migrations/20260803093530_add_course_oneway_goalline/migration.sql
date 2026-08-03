-- CreateEnum
CREATE TYPE "MeasureType" AS ENUM ('LAP', 'ONE_WAY');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "goal_line_a_lat" DECIMAL(10,7),
ADD COLUMN     "goal_line_a_lng" DECIMAL(10,7),
ADD COLUMN     "goal_line_b_lat" DECIMAL(10,7),
ADD COLUMN     "goal_line_b_lng" DECIMAL(10,7),
ADD COLUMN     "measure_type" "MeasureType" NOT NULL DEFAULT 'LAP';
