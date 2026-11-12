-- CreateEnum
CREATE TYPE "IncidentUrgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('DRAFT', 'REPORTED', 'GUIDANCE_GIVEN', 'TECHNICIAN_ASSIGNED', 'REPLACEMENT_IN_PROGRESS', 'REPLACED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "IncidentDecision" AS ENUM ('GUIDANCE', 'TECHNICIAN', 'REJECT', 'REPLACE');

-- CreateEnum
CREATE TYPE "ServiceTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReplacementStatus" AS ENUM ('PENDING_PICK', 'PICKED', 'VERIFIED', 'DISPATCHED', 'RECEIVED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ScanAction" ADD VALUE 'INCIDENT_SCAN';
ALTER TYPE "ScanAction" ADD VALUE 'REPLACEMENT_PICK';
ALTER TYPE "ScanAction" ADD VALUE 'REPLACEMENT_UNPICK';
ALTER TYPE "ScanAction" ADD VALUE 'REPLACEMENT_VERIFY';
ALTER TYPE "ScanAction" ADD VALUE 'REPLACEMENT_DISPATCH';
ALTER TYPE "ScanAction" ADD VALUE 'REPLACEMENT_RECEIVE';

-- AlterTable
ALTER TABLE "scan_events" ADD COLUMN     "incident_id" UUID,
ADD COLUMN     "replacement_task_id" UUID;

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "asset_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "pick_list_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "urgency" "IncidentUrgency" NOT NULL,
    "description" TEXT NOT NULL,
    "location_note" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'DRAFT',
    "asset_status_before" "AssetStatus",
    "asset_condition_before" "AssetCondition",
    "decision" "IncidentDecision",
    "decision_note" TEXT,
    "technician_name" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "reported_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "close_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_photos" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "mime_type" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_events" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "from_status" "IncidentStatus",
    "to_status" "IncidentStatus" NOT NULL,
    "note" TEXT,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_tickets" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "asset_id" UUID NOT NULL,
    "incident_id" UUID,
    "complaint" TEXT NOT NULL,
    "status" "ServiceTicketStatus" NOT NULL DEFAULT 'OPEN',
    "vendor" TEXT,
    "cost" BIGINT,
    "action_taken" TEXT,
    "inspection" "InspectionResult",
    "inspection_note" TEXT,
    "condition_before" "AssetCondition" NOT NULL,
    "condition_after" "AssetCondition",
    "asset_status_before" "AssetStatus" NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replacement_tasks" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "incident_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "pick_list_id" UUID NOT NULL,
    "old_asset_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "replacement_asset_id" UUID,
    "status" "ReplacementStatus" NOT NULL DEFAULT 'PENDING_PICK',
    "picked_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "dispatched_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3),
    "received_by" UUID,
    "received_pic_id" UUID,
    "receive_condition" "AssetCondition",
    "receive_note" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "replacement_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "incidents_number_key" ON "incidents"("number");

-- CreateIndex
CREATE INDEX "incidents_asset_id_idx" ON "incidents"("asset_id");

-- CreateIndex
CREATE INDEX "incidents_order_id_idx" ON "incidents"("order_id");

-- CreateIndex
CREATE INDEX "incidents_status_idx" ON "incidents"("status");

-- CreateIndex
CREATE INDEX "incidents_reporter_id_idx" ON "incidents"("reporter_id");

-- CreateIndex
CREATE INDEX "incident_photos_incident_id_idx" ON "incident_photos"("incident_id");

-- CreateIndex
CREATE INDEX "incident_events_incident_id_created_at_idx" ON "incident_events"("incident_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "service_tickets_number_key" ON "service_tickets"("number");

-- CreateIndex
CREATE INDEX "service_tickets_asset_id_idx" ON "service_tickets"("asset_id");

-- CreateIndex
CREATE INDEX "service_tickets_status_idx" ON "service_tickets"("status");

-- CreateIndex
CREATE INDEX "service_tickets_incident_id_idx" ON "service_tickets"("incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "replacement_tasks_number_key" ON "replacement_tasks"("number");

-- CreateIndex
CREATE INDEX "replacement_tasks_incident_id_idx" ON "replacement_tasks"("incident_id");

-- CreateIndex
CREATE INDEX "replacement_tasks_status_idx" ON "replacement_tasks"("status");

-- CreateIndex
CREATE INDEX "replacement_tasks_order_id_idx" ON "replacement_tasks"("order_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_replacement_task_id_fkey" FOREIGN KEY ("replacement_task_id") REFERENCES "replacement_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_photos" ADD CONSTRAINT "incident_photos_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_tasks" ADD CONSTRAINT "replacement_tasks_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_tasks" ADD CONSTRAINT "replacement_tasks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_tasks" ADD CONSTRAINT "replacement_tasks_old_asset_id_fkey" FOREIGN KEY ("old_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_tasks" ADD CONSTRAINT "replacement_tasks_replacement_asset_id_fkey" FOREIGN KEY ("replacement_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Penomoran berurutan dan atomik.
CREATE SEQUENCE "incident_number_seq" START 1;
CREATE SEQUENCE "service_ticket_number_seq" START 1;
CREATE SEQUENCE "replacement_number_seq" START 1;

-- Satu tiket servis terbuka per aset.
CREATE UNIQUE INDEX "service_tickets_asset_open_unique"
  ON "service_tickets"("asset_id") WHERE "status" IN ('OPEN', 'IN_PROGRESS');

-- Satu tugas penggantian aktif per insiden; satu aset pengganti hanya untuk satu tugas aktif.
CREATE UNIQUE INDEX "replacement_tasks_incident_active_unique"
  ON "replacement_tasks"("incident_id") WHERE "status" <> 'CANCELLED';
CREATE UNIQUE INDEX "replacement_tasks_asset_active_unique"
  ON "replacement_tasks"("replacement_asset_id")
  WHERE "status" <> 'CANCELLED' AND "replacement_asset_id" IS NOT NULL;

-- Aset pengganti tidak boleh sama dengan aset yang rusak.
ALTER TABLE "replacement_tasks" ADD CONSTRAINT "replacement_tasks_asset_differs"
  CHECK ("replacement_asset_id" IS NULL OR "replacement_asset_id" <> "old_asset_id");
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_cost_nonnegative"
  CHECK ("cost" IS NULL OR "cost" >= 0);

-- Bukti insiden dan riwayatnya append-only (fungsi forbid_mutation dari migrasi Fase 04).
CREATE TRIGGER "incident_photos_append_only" BEFORE UPDATE OR DELETE ON "incident_photos"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();
CREATE TRIGGER "incident_events_append_only" BEFORE UPDATE OR DELETE ON "incident_events"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();

-- Batas 1–5 foto per insiden juga dijaga di database (lapis kedua selain backend).
CREATE FUNCTION "incident_photo_limit"() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM "incident_photos" WHERE "incident_id" = NEW."incident_id") >= 5 THEN
    RAISE EXCEPTION 'Insiden maksimal 5 foto';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "incident_photos_limit" BEFORE INSERT ON "incident_photos"
  FOR EACH ROW EXECUTE FUNCTION "incident_photo_limit"();
