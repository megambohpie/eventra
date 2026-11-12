-- Foto produk opsional (maks. 1 per produk).
ALTER TABLE "products" ADD COLUMN "has_photo" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "product_photos" (
    "product_id" UUID NOT NULL,
    "mime_type" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_photos_pkey" PRIMARY KEY ("product_id")
);

ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback:
--   DROP TABLE "product_photos";
--   ALTER TABLE "products" DROP COLUMN "has_photo";
