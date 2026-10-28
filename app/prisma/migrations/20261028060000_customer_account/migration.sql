-- Cuenta corriente: cobros y reintegros de cada cliente.


-- CreateEnum
CREATE TYPE "CustomerPaymentKind" AS ENUM ('PAYMENT', 'REFUND');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'CUSTOMER_PAYMENT';

-- CreateTable
CREATE TABLE "customer_payments" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sale_id" TEXT,
    "kind" "CustomerPaymentKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paid_on" DATE NOT NULL,
    "notes" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" TEXT,
    "void_reason" VARCHAR(200),

    CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_customer_payments_customer_id_paid_on" ON "customer_payments"("customer_id", "paid_on");

-- CreateIndex
CREATE INDEX "idx_customer_payments_sale_id" ON "customer_payments"("sale_id");

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Montos siempre positivos (el tipo dice si suma o resta) y anulación completa:
-- fecha, quién y motivo van juntos.
ALTER TABLE "customer_payments"
  ADD CONSTRAINT "customer_payment_amount_positive_chk" CHECK ("amount" > 0),
  ADD CONSTRAINT "customer_payment_void_chk" CHECK (
    ("voided_at" IS NULL AND "voided_by" IS NULL AND "void_reason" IS NULL)
    OR ("voided_at" IS NOT NULL AND "voided_by" IS NOT NULL AND "void_reason" IS NOT NULL)
  );
