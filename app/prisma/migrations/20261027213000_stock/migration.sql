-- Stock por depósito: saldos (`product_stocks`) y libro de movimientos
-- (`stock_movements`). `products.stock` se elimina: nunca tuvo pantalla para
-- editarse, así que vale 0 en toda instalación y no se pierde información
-- (su CHECK de no negativo se va con la columna: ahora el stock puede ser negativo).
-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ENTRY', 'ADJUSTMENT', 'WRITE_OFF', 'TRANSFER_OUT', 'TRANSFER_IN', 'SALE');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'STOCK_MOVEMENT';

-- AlterTable
ALTER TABLE "products" DROP COLUMN "stock";

-- CreateTable
CREATE TABLE "product_stocks" (
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_stocks_pkey" PRIMARY KEY ("product_id","warehouse_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "balance_after" DECIMAL(12,3) NOT NULL,
    "comment" TEXT,
    "transfer_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_product_stocks_warehouse_id" ON "product_stocks"("warehouse_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_product_id_created_at" ON "stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_stock_movements_warehouse_id_created_at" ON "stock_movements"("warehouse_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_stock_movements_transfer_id" ON "stock_movements"("transfer_id");

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A mano (Prisma no los soporta) --------------------------------------------

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movement_quantity_not_zero_chk" CHECK ("quantity" <> 0),
  -- Las transferencias (y solo ellas) llevan transfer_id para unir sus dos patas.
  ADD CONSTRAINT "stock_movement_transfer_id_chk" CHECK (
    ("type" IN ('TRANSFER_OUT', 'TRANSFER_IN')) = ("transfer_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "stock_movement_direction_chk" CHECK (
    ("type" IN ('ENTRY', 'TRANSFER_IN') AND "quantity" > 0)
    OR ("type" IN ('WRITE_OFF', 'TRANSFER_OUT', 'SALE') AND "quantity" < 0)
    OR "type" = 'ADJUSTMENT'
  );

-- El libro es solo de inserción: un error se corrige con otro movimiento.
CREATE FUNCTION "stock_movements_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements es solo de inserción';
END;
$$;

CREATE TRIGGER "trg_stock_movements_no_update_delete"
BEFORE UPDATE OR DELETE ON "stock_movements"
FOR EACH ROW EXECUTE FUNCTION "stock_movements_append_only"();

CREATE TRIGGER "trg_stock_movements_no_truncate"
BEFORE TRUNCATE ON "stock_movements"
FOR EACH STATEMENT EXECUTE FUNCTION "stock_movements_append_only"();