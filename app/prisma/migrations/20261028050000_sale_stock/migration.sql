-- Movimientos de stock de los pedidos: descuento al preparar (SALE) y
-- devolución al volver a Pendiente o cancelar (SALE_RETURN), con el pedido.

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'SALE_RETURN';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "sale_id" TEXT;

-- CreateIndex
CREATE INDEX "idx_stock_movements_sale_id" ON "stock_movements"("sale_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Los movimientos de un pedido llevan el pedido, y solo ellos. Se compara
-- como texto: el valor nuevo del enum no se puede usar en esta transacción.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movement_sale_link_chk"
  CHECK (("type"::text IN ('SALE', 'SALE_RETURN')) = ("sale_id" IS NOT NULL));

-- La devolución de un pedido suma stock: se agrega al chequeo de signo.
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movement_direction_chk";
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movement_direction_chk" CHECK (
    ("type"::text IN ('ENTRY', 'TRANSFER_IN', 'SALE_RETURN') AND "quantity" > 0)
    OR ("type"::text IN ('WRITE_OFF', 'TRANSFER_OUT', 'SALE') AND "quantity" < 0)
    OR "type"::text = 'ADJUSTMENT'
  );
