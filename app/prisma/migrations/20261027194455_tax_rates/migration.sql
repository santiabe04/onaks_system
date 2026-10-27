-- El IVA del producto pasa de un número suelto (`tax_rate`) a una FK a la
-- tabla `tax_rates`. `products` está vacía en toda instalación (todavía no hay
-- ABM de productos): si no lo estuviera, el NOT NULL sin default hace fallar
-- la migración en vez de dejar productos sin alícuota.
-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'TAX_RATE';

-- AlterTable
ALTER TABLE "products" DROP COLUMN "tax_rate",
ADD COLUMN     "tax_rate_id" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,4) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_name_key" ON "tax_rates"("name");

-- CreateIndex
CREATE INDEX "idx_products_tax_rate_id" ON "products"("tax_rate_id");

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A mano (Prisma no los soporta) --------------------------------------------

ALTER TABLE "tax_rates"
  ADD CONSTRAINT "tax_rate_range_chk" CHECK ("rate" >= 0 AND "rate" <= 1),
  ADD CONSTRAINT "tax_rate_name_not_blank_chk" CHECK (btrim("name") <> '');