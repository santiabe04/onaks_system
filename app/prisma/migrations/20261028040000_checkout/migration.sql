-- Número correlativo y comentario del cliente en los pedidos.

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "notes" VARCHAR(500),
ADD COLUMN     "number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "sales_number_key" ON "sales"("number");

-- Ítems de un pedido: precio, peso e IVA de la foto no pueden ser negativos.
ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_item_snapshot_non_negative_chk"
  CHECK ("unit_price" >= 0 AND "unit_weight" >= 0 AND ("unit_volume" IS NULL OR "unit_volume" >= 0) AND "unit_tax_rate" >= 0);
