-- Proveedores y los productos que provee cada uno (código del proveedor y
-- último costo neto).

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'SUPPLIER';
ALTER TYPE "AuditEntity" ADD VALUE 'SUPPLIER_PRODUCT';

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "cuit" VARCHAR(11) NOT NULL,
    "tax_condition" "TaxCondition" NOT NULL,
    "contact_name" TEXT,
    "contact_mail" TEXT,
    "contact_phone" TEXT,
    "address" TEXT,
    "city_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_products" (
    "supplier_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "supplier_code" TEXT,
    "last_cost" DECIMAL(12,2),
    "last_cost_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("supplier_id","product_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_cuit_key" ON "suppliers"("cuit");

-- CreateIndex
CREATE INDEX "idx_suppliers_city_id" ON "suppliers"("city_id");

-- CreateIndex
CREATE INDEX "idx_supplier_products_product_id" ON "supplier_products"("product_id");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A mano (Prisma no los soporta) --------------------------------------------

ALTER TABLE "suppliers"
  ADD CONSTRAINT "supplier_cuit_format_chk" CHECK ("cuit" ~ '^[0-9]{11}$'),
  ADD CONSTRAINT "supplier_legal_name_not_blank_chk" CHECK (btrim("legal_name") <> ''),
  -- Dirección y localidad van juntas o ninguna.
  ADD CONSTRAINT "supplier_address_city_chk" CHECK (("address" IS NULL) = ("city_id" IS NULL));

ALTER TABLE "supplier_products"
  ADD CONSTRAINT "supplier_product_last_cost_non_negative_chk" CHECK ("last_cost" IS NULL OR "last_cost" >= 0);