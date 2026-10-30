-- Listas de precios (ajuste sobre el precio base + precio fijo por producto),
-- descuento por cliente y el precio base guardado en cada ítem vendido.

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'PRICE_LIST';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "discount_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
ADD COLUMN     "price_list_id" TEXT;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "unit_list_price" DECIMAL(12,2);

-- Los pedidos anteriores se vendieron al precio base.
UPDATE "sale_items" SET "unit_list_price" = "unit_price";
ALTER TABLE "sale_items" ALTER COLUMN "unit_list_price" SET NOT NULL;

-- CreateTable
CREATE TABLE "price_lists" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "adjustment" DECIMAL(5,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_items" (
    "price_list_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "price_list_items_pkey" PRIMARY KEY ("price_list_id","product_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_name_key" ON "price_lists"("name");

-- CreateIndex
CREATE INDEX "idx_price_list_items_product_id" ON "price_list_items"("product_id");

-- CreateIndex
CREATE INDEX "idx_customers_price_list_id" ON "customers"("price_list_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Checks (Prisma no los soporta).
ALTER TABLE "price_lists"
  ADD CONSTRAINT "price_list_adjustment_over_minus_one_chk" CHECK ("adjustment" > -1);
ALTER TABLE "price_list_items"
  ADD CONSTRAINT "price_list_item_price_positive_chk" CHECK ("price" > 0);
ALTER TABLE "customers"
  ADD CONSTRAINT "customer_discount_rate_range_chk" CHECK ("discount_rate" >= 0 AND "discount_rate" < 1);
