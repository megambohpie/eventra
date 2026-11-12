-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('RENT', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'GATEWAY', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('MANUAL', 'AUTO');

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "rent_amount" BIGINT NOT NULL,
    "deposit_amount" BIGINT NOT NULL,
    "due_date" DATE NOT NULL,
    "note" TEXT,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "amount" BIGINT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paid_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_by" UUID,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(3),
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_reminders" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_status_due_date_idx" ON "invoices"("status", "due_date");

-- CreateIndex
CREATE INDEX "payments_invoice_id_status_idx" ON "payments"("invoice_id", "status");

-- CreateIndex
CREATE INDEX "payments_status_paid_at_idx" ON "payments"("status", "paid_at");

-- CreateIndex
CREATE INDEX "invoice_reminders_invoice_id_created_at_idx" ON "invoice_reminders"("invoice_id", "created_at");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Penomoran invoice: INV-YYYY-######
CREATE SEQUENCE "invoice_number_seq" START 1;

-- Satu invoice aktif per pesanan
CREATE UNIQUE INDEX "invoices_order_active_unique" ON "invoices"("order_id") WHERE "status" = 'ISSUED';

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_valid" CHECK ("rent_amount" >= 0 AND "deposit_amount" >= 0 AND ("rent_amount" + "deposit_amount") > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);

-- Pembayaran historis: tidak boleh dihapus, nominal/tujuan/invoice tidak boleh diubah, dan status hanya
-- berubah searah (PENDING -> SUCCEEDED/FAILED/VOIDED, SUCCEEDED -> VOIDED). Koreksi = VOIDED + alasan.
CREATE FUNCTION "guard_payment_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments bersifat append-only (tidak dapat dihapus)';
  END IF;
  IF NEW.invoice_id <> OLD.invoice_id OR NEW.amount <> OLD.amount OR NEW.purpose <> OLD.purpose
     OR NEW.method <> OLD.method OR NEW.paid_at <> OLD.paid_at THEN
    RAISE EXCEPTION 'nominal, tujuan, metode, dan tanggal pembayaran tidak dapat diubah';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'PENDING' AND NEW.status IN ('SUCCEEDED', 'FAILED', 'VOIDED'))
    OR (OLD.status = 'SUCCEEDED' AND NEW.status = 'VOIDED')) THEN
    RAISE EXCEPTION 'transisi status pembayaran % -> % tidak valid', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "payments_guard" BEFORE UPDATE OR DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION "guard_payment_change"();

-- Invoice tidak dihapus dan nominalnya tidak diubah (hanya VOID dengan alasan); pengingat append-only.
CREATE FUNCTION "guard_invoice_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoices bersifat append-only (tidak dapat dihapus)';
  END IF;
  IF NEW.order_id <> OLD.order_id OR NEW.rent_amount <> OLD.rent_amount
     OR NEW.deposit_amount <> OLD.deposit_amount OR NEW.number <> OLD.number THEN
    RAISE EXCEPTION 'nominal dan pesanan invoice tidak dapat diubah; batalkan lalu terbitkan ulang';
  END IF;
  IF OLD.status = 'VOID' AND NEW.status <> 'VOID' THEN
    RAISE EXCEPTION 'invoice yang dibatalkan tidak dapat dihidupkan kembali';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "invoices_guard" BEFORE UPDATE OR DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION "guard_invoice_change"();

CREATE TRIGGER "invoice_reminders_append_only" BEFORE UPDATE OR DELETE ON "invoice_reminders"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();
