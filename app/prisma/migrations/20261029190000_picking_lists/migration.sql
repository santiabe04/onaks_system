-- Listas de picking por depósito (pedidos Pendientes → En preparación → Listo
-- para despachar) y la ubicación de cada producto en cada depósito.

-- CreateEnum
CREATE TYPE "PickingListState" AS ENUM ('OPEN', 'PREPARED', 'CANCELED');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'PICKING_LIST';
ALTER TYPE "AuditEntity" ADD VALUE 'PRODUCT_LOCATION';

-- AlterTable
ALTER TABLE "product_stocks" ADD COLUMN     "location" VARCHAR(30);

-- CreateTable
CREATE TABLE "picking_lists" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "state" "PickingListState" NOT NULL DEFAULT 'OPEN',
    "notes" VARCHAR(300),
    "preparer" VARCHAR(80),
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by" TEXT,
    "canceled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "picking_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "picking_list_items" (
    "picking_list_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "picked" DECIMAL(12,3),
    "shortage_reason" VARCHAR(20),

    CONSTRAINT "picking_list_items_pkey" PRIMARY KEY ("picking_list_id","sale_id","product_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "picking_lists_number_key" ON "picking_lists"("number");

-- CreateIndex
CREATE INDEX "idx_picking_lists_state" ON "picking_lists"("state");

-- CreateIndex
CREATE INDEX "idx_picking_list_items_sale_id" ON "picking_list_items"("sale_id");

-- CreateIndex
CREATE INDEX "idx_picking_list_items_product_id" ON "picking_list_items"("product_id");

-- AddForeignKey
ALTER TABLE "picking_lists" ADD CONSTRAINT "picking_lists_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_lists" ADD CONSTRAINT "picking_lists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_lists" ADD CONSTRAINT "picking_lists_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_list_items" ADD CONSTRAINT "picking_list_items_picking_list_id_fkey" FOREIGN KEY ("picking_list_id") REFERENCES "picking_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_list_items" ADD CONSTRAINT "picking_list_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_list_items" ADD CONSTRAINT "picking_list_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lo preparado no supera lo pedido; si faltó, lleva motivo (y solo entonces).
ALTER TABLE "picking_list_items"
  ADD CONSTRAINT "picking_list_item_values_chk" CHECK (
    "quantity" > 0
    AND ("picked" IS NULL OR ("picked" >= 0 AND "picked" <= "quantity"))
    AND ("shortage_reason" IS NULL OR "shortage_reason" IN ('MISSING', 'WRITTEN_OFF'))
    AND (("shortage_reason" IS NOT NULL) = ("picked" IS NOT NULL AND "picked" < "quantity"))
  );

-- Preparada lleva fecha de confirmación; anulada, fecha de anulación.
ALTER TABLE "picking_lists"
  ADD CONSTRAINT "picking_list_state_chk" CHECK (
    (("state" = 'PREPARED') = ("confirmed_at" IS NOT NULL))
    AND (("state" = 'CANCELED') = ("canceled_at" IS NOT NULL))
  );
