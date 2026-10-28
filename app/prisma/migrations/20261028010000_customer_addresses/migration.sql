-- Las direcciones de entrega pasan de la persona al cliente (empresa): cualquier
-- persona del cliente usa cualquiera de sus direcciones al comprar.
-- `person_addresses` está vacía en toda instalación (no había pantalla para
-- cargarlas); igual, si tuviera filas, la migración falla en vez de perderlas.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "person_addresses") THEN
    RAISE EXCEPTION 'person_addresses tiene filas: migrarlas a customer_addresses a mano';
  END IF;
END $$;

-- AlterEnum
ALTER TYPE "AuditEntity" RENAME VALUE 'PERSON_ADDRESS' TO 'CUSTOMER_ADDRESS';
-- DropForeignKey
ALTER TABLE "person_addresses" DROP CONSTRAINT "person_addresses_city_id_fkey";

-- DropForeignKey
ALTER TABLE "person_addresses" DROP CONSTRAINT "person_addresses_person_id_fkey";

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_address_id_fkey";

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "updated_by" TEXT;

-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "updated_by" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- DropTable
DROP TABLE "person_addresses";

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "city_id" INTEGER NOT NULL,
    "zip_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_customer_addresses_customer_id" ON "customer_addresses"("customer_id");

-- CreateIndex
CREATE INDEX "idx_customer_addresses_city_id" ON "customer_addresses"("city_id");

-- CreateIndex
CREATE INDEX "idx_customers_deleted_at" ON "customers"("deleted_at");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "customer_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A mano (Prisma no los soporta) --------------------------------------------

ALTER TABLE "customers"
  ADD CONSTRAINT "customer_trade_name_not_blank_chk" CHECK (btrim("trade_name") <> ''),
  ADD CONSTRAINT "customer_legal_name_not_blank_chk" CHECK (btrim("legal_name") <> '');

ALTER TABLE "persons"
  ADD CONSTRAINT "person_name_not_blank_chk" CHECK (btrim("name") <> '' AND btrim("surname") <> ''),
  ADD CONSTRAINT "person_mail_lowercase_chk" CHECK ("mail" = lower("mail"));

ALTER TABLE "customer_addresses"
  ADD CONSTRAINT "customer_address_not_blank_chk" CHECK (btrim("name") <> '' AND btrim("address") <> '');