-- CreateTable
CREATE TABLE "asset_photos" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "mime_type" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_batch_photos" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "batch_date" DATE NOT NULL,
    "mime_type" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_batch_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_photos_asset_id_idx" ON "asset_photos"("asset_id");

-- CreateIndex
CREATE INDEX "asset_batch_photos_product_id_batch_date_idx" ON "asset_batch_photos"("product_id", "batch_date");

-- AddForeignKey
ALTER TABLE "asset_photos" ADD CONSTRAINT "asset_photos_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_batch_photos" ADD CONSTRAINT "asset_batch_photos_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foto = bukti historis: tidak boleh diubah/dihapus (foto baru = baris baru).
CREATE TRIGGER "asset_photos_append_only" BEFORE UPDATE OR DELETE ON "asset_photos"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();
CREATE TRIGGER "asset_batch_photos_append_only" BEFORE UPDATE OR DELETE ON "asset_batch_photos"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();

-- Rollback: DROP TRIGGER asset_photos_append_only ON asset_photos; DROP TRIGGER asset_batch_photos_append_only ON asset_batch_photos; DROP TABLE asset_photos; DROP TABLE asset_batch_photos;
