-- CreateEnum
CREATE TYPE "PickListStatus" AS ENUM ('OPEN', 'VERIFIED', 'DISPATCHED', 'RETURNED', 'RETURN_ISSUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PickItemStatus" AS ENUM ('PICKED', 'VERIFIED', 'DISPATCHED', 'RETURNED', 'MISSING', 'REMOVED');

-- CreateEnum
CREATE TYPE "ScanAction" AS ENUM ('PICK', 'UNPICK', 'VERIFY', 'CHECKOUT', 'RETURN', 'RETURN_MISSING');

-- CreateEnum
CREATE TYPE "ScanResult" AS ENUM ('OK', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScanMethod" AS ENUM ('QR', 'MANUAL');

-- CreateEnum
CREATE TYPE "HandoverType" AS ENUM ('OUT', 'RETURN');

-- CreateEnum
CREATE TYPE "SignerRole" AS ENUM ('WAREHOUSE', 'COUNTERPART');

-- CreateTable
CREATE TABLE "pick_lists" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "PickListStatus" NOT NULL DEFAULT 'OPEN',
    "dispatched_at" TIMESTAMPTZ(3),
    "returned_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pick_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pick_list_lines" (
    "id" UUID NOT NULL,
    "pick_list_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "pick_list_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pick_list_items" (
    "id" UUID NOT NULL,
    "pick_list_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "status" "PickItemStatus" NOT NULL DEFAULT 'PICKED',
    "picked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ(3),
    "dispatched_at" TIMESTAMPTZ(3),
    "dispatch_condition" "AssetCondition",
    "returned_at" TIMESTAMPTZ(3),
    "return_condition" "AssetCondition",
    "return_note" TEXT,

    CONSTRAINT "pick_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_events" (
    "id" UUID NOT NULL,
    "action" "ScanAction" NOT NULL,
    "result" "ScanResult" NOT NULL,
    "method" "ScanMethod" NOT NULL,
    "reason" TEXT,
    "pick_list_id" UUID,
    "order_id" UUID,
    "asset_id" UUID,
    "condition" "AssetCondition",
    "note" TEXT,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_photos" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "mime_type" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_documents" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "type" "HandoverType" NOT NULL,
    "order_id" UUID NOT NULL,
    "pick_list_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "revision_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_signatures" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "role" "SignerRole" NOT NULL,
    "pic_id" UUID,
    "signer_name" TEXT NOT NULL,
    "signer_role" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "signed_by" UUID,
    "signed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pick_lists_number_key" ON "pick_lists"("number");

-- CreateIndex
CREATE INDEX "pick_lists_order_id_idx" ON "pick_lists"("order_id");

-- CreateIndex
CREATE INDEX "pick_lists_status_idx" ON "pick_lists"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pick_list_lines_pick_list_id_product_id_key" ON "pick_list_lines"("pick_list_id", "product_id");

-- CreateIndex
CREATE INDEX "pick_list_items_pick_list_id_idx" ON "pick_list_items"("pick_list_id");

-- CreateIndex
CREATE INDEX "pick_list_items_asset_id_idx" ON "pick_list_items"("asset_id");

-- CreateIndex
CREATE INDEX "scan_events_pick_list_id_created_at_idx" ON "scan_events"("pick_list_id", "created_at");

-- CreateIndex
CREATE INDEX "scan_events_asset_id_created_at_idx" ON "scan_events"("asset_id", "created_at");

-- CreateIndex
CREATE INDEX "scan_photos_item_id_idx" ON "scan_photos"("item_id");

-- CreateIndex
CREATE INDEX "handover_documents_order_id_type_idx" ON "handover_documents"("order_id", "type");

-- CreateIndex
CREATE INDEX "handover_documents_pick_list_id_idx" ON "handover_documents"("pick_list_id");

-- CreateIndex
CREATE UNIQUE INDEX "handover_documents_number_version_key" ON "handover_documents"("number", "version");

-- CreateIndex
CREATE UNIQUE INDEX "document_signatures_document_id_role_key" ON "document_signatures"("document_id", "role");

-- AddForeignKey
ALTER TABLE "pick_lists" ADD CONSTRAINT "pick_lists_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_list_lines" ADD CONSTRAINT "pick_list_lines_pick_list_id_fkey" FOREIGN KEY ("pick_list_id") REFERENCES "pick_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_list_lines" ADD CONSTRAINT "pick_list_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_list_items" ADD CONSTRAINT "pick_list_items_pick_list_id_fkey" FOREIGN KEY ("pick_list_id") REFERENCES "pick_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_list_items" ADD CONSTRAINT "pick_list_items_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_list_items" ADD CONSTRAINT "pick_list_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_pick_list_id_fkey" FOREIGN KEY ("pick_list_id") REFERENCES "pick_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_photos" ADD CONSTRAINT "scan_photos_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "pick_list_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_documents" ADD CONSTRAINT "handover_documents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_documents" ADD CONSTRAINT "handover_documents_pick_list_id_fkey" FOREIGN KEY ("pick_list_id") REFERENCES "pick_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "handover_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Penomoran dokumen berurutan dan atomik.
CREATE SEQUENCE "pick_list_number_seq" START 1;
CREATE SEQUENCE "handover_out_number_seq" START 1;
CREATE SEQUENCE "handover_return_number_seq" START 1;

-- Satu pick list non-batal per pesanan.
CREATE UNIQUE INDEX "pick_lists_order_active_unique"
  ON "pick_lists"("order_id") WHERE "status" <> 'CANCELLED';

-- Satu aset hanya boleh berada pada satu pick list aktif (invarian: satu alokasi aktif per aset).
CREATE UNIQUE INDEX "pick_list_items_asset_active_unique"
  ON "pick_list_items"("asset_id") WHERE "status" IN ('PICKED', 'VERIFIED', 'DISPATCHED', 'MISSING');

ALTER TABLE "pick_list_lines" ADD CONSTRAINT "pick_list_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "handover_documents" ADD CONSTRAINT "handover_documents_version_positive" CHECK ("version" >= 1);

-- Append-only / immutable di level database (AGENTS.md: dokumen & scan event tidak boleh diubah/dihapus).
CREATE FUNCTION "forbid_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% pada tabel % tidak diizinkan (append-only)', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "scan_events_append_only" BEFORE UPDATE OR DELETE ON "scan_events"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();
CREATE TRIGGER "handover_documents_immutable" BEFORE UPDATE OR DELETE ON "handover_documents"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();
CREATE TRIGGER "document_signatures_append_only" BEFORE UPDATE OR DELETE ON "document_signatures"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();
