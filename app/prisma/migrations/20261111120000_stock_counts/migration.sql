-- Conteos de inventario por depósito (se cargan desde el celular y al aprobarse
-- asientan las diferencias como ajustes de stock).

-- CreateEnum
CREATE TYPE "StockCountState" AS ENUM ('OPEN', 'APPROVED', 'CANCELED');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'STOCK_COUNT';

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "state" "StockCountState" NOT NULL DEFAULT 'OPEN',
    "notes" VARCHAR(300),
    "approved_at" TIMESTAMPTZ(3),
    "approved_by" TEXT,
    "canceled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_items" (
    "stock_count_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "counted" DECIMAL(12,3) NOT NULL,
    "expected" DECIMAL(12,3) NOT NULL,
    "applied" DECIMAL(12,3),

    CONSTRAINT "stock_count_items_pkey" PRIMARY KEY ("stock_count_id","product_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_number_key" ON "stock_counts"("number");

-- CreateIndex
CREATE INDEX "idx_stock_counts_state" ON "stock_counts"("state");

-- CreateIndex
CREATE INDEX "idx_stock_counts_warehouse_id" ON "stock_counts"("warehouse_id");

-- CreateIndex
CREATE INDEX "idx_stock_count_items_product_id" ON "stock_count_items"("product_id");

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un solo conteo abierto por depósito (lo escrito a mano no lo expresa Prisma).
CREATE UNIQUE INDEX "uq_stock_counts_open_warehouse" ON "stock_counts"("warehouse_id") WHERE "state" = 'OPEN';

-- CHECK: lo contado no es negativo (el saldo esperado sí puede serlo).
ALTER TABLE "stock_count_items" ADD CONSTRAINT "chk_stock_count_items_counted" CHECK ("counted" >= 0);
