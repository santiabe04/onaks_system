-- Límite de crédito y plazo de pago por cliente; pedidos retenidos por crédito
-- hasta que el admin los aprueba.

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "credit_limit" DECIMAL(12,2),
ADD COLUMN     "payment_term_days" INTEGER;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "credit_hold_at" TIMESTAMPTZ(3),
ADD COLUMN     "credit_hold_reasons" JSONB,
ADD COLUMN     "credit_release_note" VARCHAR(300),
ADD COLUMN     "credit_released_at" TIMESTAMPTZ(3),
ADD COLUMN     "credit_released_by" TEXT;

-- CreateIndex
CREATE INDEX "idx_sales_credit_hold_at" ON "sales"("credit_hold_at");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_credit_released_by_fkey" FOREIGN KEY ("credit_released_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Checks (Prisma no los soporta).
ALTER TABLE "customers"
  ADD CONSTRAINT "customer_credit_limit_not_negative_chk" CHECK ("credit_limit" >= 0),
  ADD CONSTRAINT "customer_payment_term_days_positive_chk" CHECK ("payment_term_days" > 0);
ALTER TABLE "sales"
  ADD CONSTRAINT "sale_credit_release_after_hold_chk" CHECK ("credit_released_at" IS NULL OR "credit_hold_at" IS NOT NULL);
