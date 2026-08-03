-- AlterTable
ALTER TABLE "laps" ADD COLUMN     "klass" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "session_id" TEXT,
ADD COLUMN     "session_name" TEXT,
ADD COLUMN     "tire" TEXT,
ADD COLUMN     "zekken" TEXT;

-- CreateIndex
CREATE INDEX "laps_event_id_session_id_idx" ON "laps"("event_id", "session_id");
