-- AlterTable
ALTER TABLE "laps" ADD COLUMN     "course_id" TEXT,
ALTER COLUMN "event_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "laps_user_id_course_id_idx" ON "laps"("user_id", "course_id");

-- AddForeignKey
ALTER TABLE "laps" ADD CONSTRAINT "laps_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
