-- Compras: stock mínimo por producto y órdenes de compra a proveedores.


-- CreateEnum
CREATE TYPE "PurchaseOrderState" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELED');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'PURCHASE_ORDER';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "min_stock" DECIMAL(12,3);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "state" "PurchaseOrderState" NOT NULL DEFAULT 'DRAFT',
    "expected_date" DATE,
    "notes" VARCHAR(300),
    "sub_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(3),
    "canceled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "purchase_order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(5,4) NOT NULL,
    "received_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("purchase_order_id","product_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE INDEX "idx_purchase_orders_supplier_id_state" ON "purchase_orders"("supplier_id", "state");

-- CreateIndex
CREATE INDEX "idx_purchase_orders_state" ON "purchase_orders"("state");

-- CreateIndex
CREATE INDEX "idx_purchase_order_items_product_id" ON "purchase_order_items"("product_id");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Cantidades y costos válidos; lo recibido no es negativo (puede superar lo pedido).
ALTER TABLE "purchase_order_items"
  ADD CONSTRAINT "purchase_order_item_values_chk" CHECK (
    "quantity" > 0 AND "unit_cost" >= 0 AND "tax_rate" >= 0 AND "received_quantity" >= 0
  );
ALTER TABLE "products"
  ADD CONSTRAINT "product_min_stock_non_negative_chk" CHECK ("min_stock" IS NULL OR "min_stock" >= 0);
