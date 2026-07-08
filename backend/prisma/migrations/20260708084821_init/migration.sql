-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DRIVER', 'ORGANIZER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CircuitType" AS ENUM ('CIRCUIT', 'GYMKHANA', 'RALLY', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'DRIVER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circuits" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "state" TEXT,
    "name" TEXT NOT NULL,
    "type" "CircuitType" NOT NULL DEFAULT 'CIRCUIT',
    "control_line_a_lat" DECIMAL(10,7) NOT NULL,
    "control_line_a_lng" DECIMAL(10,7) NOT NULL,
    "control_line_b_lat" DECIMAL(10,7) NOT NULL,
    "control_line_b_lng" DECIMAL(10,7) NOT NULL,
    "reference_lap_time" INTEGER,
    "description" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "circuits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "event_code" TEXT NOT NULL,
    "max_participants" INTEGER,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "organizer_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laps" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT,
    "driver_name" TEXT NOT NULL,
    "vehicle" TEXT,
    "lap_number" INTEGER NOT NULL,
    "lap_time_ms" INTEGER NOT NULL,
    "lap_time_str" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "laps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "circuits_country_state_idx" ON "circuits"("country", "state");

-- CreateIndex
CREATE UNIQUE INDEX "circuits_country_state_name_key" ON "circuits"("country", "state", "name");

-- CreateIndex
CREATE UNIQUE INDEX "events_event_code_key" ON "events"("event_code");

-- CreateIndex
CREATE INDEX "events_event_code_idx" ON "events"("event_code");

-- CreateIndex
CREATE INDEX "events_event_date_idx" ON "events"("event_date");

-- CreateIndex
CREATE INDEX "events_circuit_id_idx" ON "events"("circuit_id");

-- CreateIndex
CREATE INDEX "laps_event_id_lap_time_ms_idx" ON "laps"("event_id", "lap_time_ms");

-- CreateIndex
CREATE INDEX "laps_user_id_idx" ON "laps"("user_id");

-- CreateIndex
CREATE INDEX "laps_recorded_at_idx" ON "laps"("recorded_at");

-- AddForeignKey
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laps" ADD CONSTRAINT "laps_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laps" ADD CONSTRAINT "laps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
