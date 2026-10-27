-- Datos del producto para el ABM: SKU, código de barras, categoría, imagen y
-- estado activo/pausado. `products` sigue vacía en toda instalación (el ABM
-- llega con esta migración), así que los NOT NULL sin default no rompen nada;
-- si tuviera filas, la migración falla en vez de inventar valores.
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "category_id" INTEGER NOT NULL,
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "image_file" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sku" TEXT NOT NULL,
ADD COLUMN     "updated_by" TEXT,
ALTER COLUMN "stock" SET DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE INDEX "idx_products_category_id" ON "products"("category_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A mano (Prisma no los soporta) --------------------------------------------

ALTER TABLE "products"
  ADD CONSTRAINT "product_name_not_blank_chk" CHECK (btrim("name") <> ''),
  ADD CONSTRAINT "product_sku_not_blank_chk" CHECK (btrim("sku") <> ''),
  ADD CONSTRAINT "product_weight_positive_chk" CHECK ("weight" > 0),
  ADD CONSTRAINT "product_volume_non_negative_chk" CHECK ("volume" IS NULL OR "volume" >= 0);