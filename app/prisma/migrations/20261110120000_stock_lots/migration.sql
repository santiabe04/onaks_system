-- Lotes y vencimientos: productos que controlan vencimiento, lotes por depósito, el lote de cada movimiento y cómo se reparte lo recibido.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "tracks_expiry" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "lot_id" TEXT;

-- CreateTable
CREATE TABLE "stock_lots" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "lot_code" VARCHAR(40) NOT NULL,
    "expires_on" DATE NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lots" (
    "id" TEXT NOT NULL,
    "goods_receipt_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "lot_code" VARCHAR(40) NOT NULL,
    "expires_on" DATE NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "goods_receipt_lots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_stock_lots_expires_on" ON "stock_lots"("expires_on");

-- CreateIndex
CREATE UNIQUE INDEX "uq_stock_lots_product_warehouse_lot" ON "stock_lots"("product_id", "warehouse_id", "lot_code", "expires_on");

-- CreateIndex
CREATE INDEX "idx_goods_receipt_lots_product_id" ON "goods_receipt_lots"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_goods_receipt_lots_lot" ON "goods_receipt_lots"("goods_receipt_id", "product_id", "lot_code", "expires_on");

-- CreateIndex
CREATE INDEX "idx_stock_movements_lot_id" ON "stock_movements"("lot_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "stock_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lots" ADD CONSTRAINT "goods_receipt_lots_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lots" ADD CONSTRAINT "goods_receipt_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas que Prisma no expresa.
ALTER TABLE "stock_lots"
  ADD CONSTRAINT "ck_stock_lots_quantity" CHECK ("quantity" >= 0),
  ADD CONSTRAINT "ck_stock_lots_code" CHECK (btrim("lot_code") <> '');

ALTER TABLE "goods_receipt_lots"
  ADD CONSTRAINT "ck_goods_receipt_lots_quantity" CHECK ("quantity" > 0),
  ADD CONSTRAINT "ck_goods_receipt_lots_code" CHECK (btrim("lot_code") <> '');
