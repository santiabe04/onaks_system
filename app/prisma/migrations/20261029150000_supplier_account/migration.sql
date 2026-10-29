-- Cuenta corriente de proveedores: órdenes de pago (con sus medios), notas de
-- crédito por importe e imputaciones de ambas a las facturas.

-- CreateEnum
CREATE TYPE "SupplierPaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CHECK', 'WITHHOLDING');

-- CreateEnum
CREATE TYPE "WithholdingType" AS ENUM ('VAT', 'IIBB', 'INCOME');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'SUPPLIER_PAYMENT';
ALTER TYPE "AuditEntity" ADD VALUE 'SUPPLIER_CREDIT_NOTE';

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "paid_on" DATE NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "notes" VARCHAR(300),
    "annulled_at" TIMESTAMPTZ(3),
    "annul_reason" VARCHAR(300),
    "annulled_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payment_lines" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "method" "SupplierPaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" VARCHAR(50),
    "bank" VARCHAR(80),
    "due_date" DATE,
    "withholding_type" "WithholdingType",

    CONSTRAINT "supplier_payment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_credit_notes" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "type" "InvoiceType" NOT NULL,
    "point_of_sale" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "issue_date" DATE NOT NULL,
    "sub_total" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "notes" VARCHAR(300),
    "annulled_at" TIMESTAMPTZ(3),
    "annul_reason" VARCHAR(300),
    "annulled_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "supplier_credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_allocations" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "credit_note_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "supplier_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_number_key" ON "supplier_payments"("number");

-- CreateIndex
CREATE INDEX "idx_supplier_payments_supplier_id_paid_on" ON "supplier_payments"("supplier_id", "paid_on");

-- CreateIndex
CREATE INDEX "idx_supplier_payment_lines_payment_id" ON "supplier_payment_lines"("payment_id");

-- CreateIndex
CREATE INDEX "idx_supplier_credit_notes_supplier_id_number" ON "supplier_credit_notes"("supplier_id", "type", "point_of_sale", "number");

-- CreateIndex
CREATE INDEX "idx_supplier_credit_notes_invoice_id" ON "supplier_credit_notes"("invoice_id");

-- CreateIndex
CREATE INDEX "idx_supplier_allocations_invoice_id" ON "supplier_allocations"("invoice_id");

-- CreateIndex
CREATE INDEX "idx_supplier_allocations_payment_id" ON "supplier_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "idx_supplier_allocations_credit_note_id" ON "supplier_allocations"("credit_note_id");

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_annulled_by_fkey" FOREIGN KEY ("annulled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_lines" ADD CONSTRAINT "supplier_payment_lines_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_credit_notes" ADD CONSTRAINT "supplier_credit_notes_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_credit_notes" ADD CONSTRAINT "supplier_credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_credit_notes" ADD CONSTRAINT "supplier_credit_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_credit_notes" ADD CONSTRAINT "supplier_credit_notes_annulled_by_fkey" FOREIGN KEY ("annulled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_allocations" ADD CONSTRAINT "supplier_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_allocations" ADD CONSTRAINT "supplier_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_allocations" ADD CONSTRAINT "supplier_allocations_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "supplier_credit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_allocations" ADD CONSTRAINT "supplier_allocations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- OP: total positivo; anulada si y solo si tiene fecha y motivo.
ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payment_values_chk" CHECK (
    "total" > 0
    AND (("annulled_at" IS NULL) = ("annul_reason" IS NULL))
  );

-- Medios: importe positivo; el cheque lleva banco, número y fecha; la
-- retención, tipo y certificado; los demás no llevan esos datos.
ALTER TABLE "supplier_payment_lines"
  ADD CONSTRAINT "supplier_payment_line_values_chk" CHECK (
    "amount" > 0
    AND (("method" = 'CHECK') = ("bank" IS NOT NULL AND "due_date" IS NOT NULL))
    AND (("method" = 'WITHHOLDING') = ("withholding_type" IS NOT NULL))
    AND ("method" NOT IN ('CHECK', 'WITHHOLDING') OR "reference" IS NOT NULL)
  );

-- NC: comprobante válido, importes no negativos, el total cierra.
ALTER TABLE "supplier_credit_notes"
  ADD CONSTRAINT "supplier_credit_note_values_chk" CHECK (
    "point_of_sale" BETWEEN 1 AND 99999 AND "number" BETWEEN 1 AND 99999999
    AND "sub_total" >= 0 AND "tax" >= 0 AND "total" > 0
    AND "total" = "sub_total" + "tax"
    AND (("annulled_at" IS NULL) = ("annul_reason" IS NULL))
  );

-- Imputación: importe positivo y de una OP o de una NC (una sola).
ALTER TABLE "supplier_allocations"
  ADD CONSTRAINT "supplier_allocation_values_chk" CHECK (
    "amount" > 0 AND (("payment_id" IS NULL) <> ("credit_note_id" IS NULL))
  );
