-- Carrito en la DB (uno por persona) y unidades que admiten cantidades con decimales.

-- AlterTable
ALTER TABLE "measurement_units" ADD COLUMN     "allows_decimals" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "cart_items" (
    "person_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("person_id","product_id")
);

-- CreateIndex
CREATE INDEX "idx_cart_items_product_id" ON "cart_items"("product_id");

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A mano --------------------------------------------------------------------

-- Las unidades del seed que se venden fraccionadas.
UPDATE "measurement_units" SET "allows_decimals" = true WHERE "name" IN ('kg', 'l');

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_item_quantity_positive_chk" CHECK ("quantity" > 0);