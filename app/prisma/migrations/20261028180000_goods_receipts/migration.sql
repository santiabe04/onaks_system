-- Informes de recepción (IR) de las órdenes de compra: ingresan el stock a un
-- depósito, actualizan lo recibido de la OC y se anulan con motivo.

-- CreateEnum
CREATE TYPE "GoodsReceiptState" AS ENUM ('CONFIRMED', 'ANNULLED');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'GOODS_RECEIPT';

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'PURCHASE_RECEIPT';
ALTER TYPE "StockMovementType" ADD VALUE 'PURCHASE_RECEIPT_REVERSAL';

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "close_note" VARCHAR(300),
ADD COLUMN     "closed_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "goods_receipt_id" TEXT;

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "delivery_note" VARCHAR(50),
    "notes" VARCHAR(300),
    "state" "GoodsReceiptState" NOT NULL DEFAULT 'CONFIRMED',
    "annulled_at" TIMESTAMPTZ(3),
    "annul_reason" VARCHAR(300),
    "annulled_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_items" (
    "goods_receipt_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "pending" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("goods_receipt_id","product_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_number_key" ON "goods_receipts"("number");

-- CreateIndex
CREATE INDEX "idx_goods_receipts_purchase_order_id" ON "goods_receipts"("purchase_order_id");

-- CreateIndex
CREATE INDEX "idx_goods_receipts_warehouse_id" ON "goods_receipts"("warehouse_id");

-- CreateIndex
CREATE INDEX "idx_goods_receipt_items_product_id" ON "goods_receipt_items"("product_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_goods_receipt_id" ON "stock_movements"("goods_receipt_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_annulled_by_fkey" FOREIGN KEY ("annulled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Los movimientos de un IR llevan el informe, y solo ellos (como texto: los
-- valores nuevos del enum no se pueden usar en esta transacción).
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movement_receipt_link_chk"
  CHECK (("type"::text IN ('PURCHASE_RECEIPT', 'PURCHASE_RECEIPT_REVERSAL')) = ("goods_receipt_id" IS NOT NULL));

-- El ingreso suma y su reversión resta.
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movement_direction_chk";
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movement_direction_chk" CHECK (
    ("type"::text IN ('ENTRY', 'TRANSFER_IN', 'SALE_RETURN', 'PURCHASE_RECEIPT') AND "quantity" > 0)
    OR ("type"::text IN ('WRITE_OFF', 'TRANSFER_OUT', 'SALE', 'PURCHASE_RECEIPT_REVERSAL') AND "quantity" < 0)
    OR "type"::text = 'ADJUSTMENT'
  );

-- Lo recibido es positivo; lo pendiente, no negativo.
ALTER TABLE "goods_receipt_items"
  ADD CONSTRAINT "goods_receipt_item_values_chk" CHECK ("quantity" > 0 AND "pending" >= 0);

-- Anulado si y solo si tiene fecha y motivo.
ALTER TABLE "goods_receipts"
  ADD CONSTRAINT "goods_receipt_annulled_chk" CHECK (
    ("state" = 'ANNULLED') = ("annulled_at" IS NOT NULL AND "annul_reason" IS NOT NULL)
  );

-- Solo una OC Recibida puede estar cerrada con faltante.
ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_order_closed_chk" CHECK ("closed_at" IS NULL OR "state" = 'RECEIVED');
