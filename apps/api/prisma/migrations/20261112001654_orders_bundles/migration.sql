-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'QUOTED', 'AWAITING_PAYMENT', 'CONFIRMED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'ISSUE');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('HOLD', 'CONFIRMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "PicRole" AS ENUM ('CUSTOMER_PIC', 'WAREHOUSE_OUT', 'WAREHOUSE_IN', 'FIELD');

-- CreateEnum
CREATE TYPE "PicSource" AS ENUM ('OWNER', 'CUSTOMER', 'THIRD_PARTY');

-- CreateTable
CREATE TABLE "product_bundles" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "component_product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "event_location" TEXT NOT NULL,
    "note" TEXT,
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "deposit_total" BIGINT NOT NULL DEFAULT 0,
    "hold_expires_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "unit_deposit" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_quotes" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "subtotal" BIGINT NOT NULL,
    "deposit_total" BIGINT NOT NULL,
    "note" TEXT,
    "snapshot" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_allocations" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "AllocationStatus" NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_pics" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "role" "PicRole" NOT NULL,
    "source" "PicSource" NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "organization" TEXT,
    "authorization" TEXT,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_pics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_bundles_component_product_id_idx" ON "product_bundles"("component_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_bundles_product_id_component_product_id_key" ON "product_bundles"("product_id", "component_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_start_date_end_date_idx" ON "orders"("start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_product_id_key" ON "order_items"("order_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_quotes_order_id_version_key" ON "order_quotes"("order_id", "version");

-- CreateIndex
CREATE INDEX "stock_allocations_product_id_date_status_idx" ON "stock_allocations"("product_id", "date", "status");

-- CreateIndex
CREATE INDEX "stock_allocations_order_id_idx" ON "stock_allocations"("order_id");

-- CreateIndex
CREATE INDEX "order_pics_order_id_idx" ON "order_pics"("order_id");

-- CreateIndex
CREATE INDEX "order_status_events_order_id_created_at_idx" ON "order_status_events"("order_id", "created_at");

-- AddForeignKey
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_quotes" ADD CONSTRAINT "order_quotes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_allocations" ADD CONSTRAINT "stock_allocations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_allocations" ADD CONSTRAINT "stock_allocations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_pics" ADD CONSTRAINT "order_pics_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_pics" ADD CONSTRAINT "order_pics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_pics" ADD CONSTRAINT "order_pics_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Penomoran pesanan atomik.
CREATE SEQUENCE "order_number_seq" START 1;

-- Satu alokasi aktif per (pesanan, produk, tanggal); baris RELEASED tetap tersimpan sebagai riwayat.
CREATE UNIQUE INDEX "stock_allocations_active_unique"
  ON "stock_allocations" ("order_id", "product_id", "date")
  WHERE "status" <> 'RELEASED';

-- Pagar terakhir di level database.
ALTER TABLE "stock_allocations" ADD CONSTRAINT "stock_allocations_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_not_self" CHECK ("product_id" <> "component_product_id");
ALTER TABLE "orders" ADD CONSTRAINT "orders_date_range" CHECK ("end_date" >= "start_date");
