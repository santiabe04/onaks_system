-- Provincias y localidades pasan a tener ABM: columnas de auditoría como el
-- resto de las tablas editables. Ya tienen filas (las carga el seed), así que
-- `updated_at` se agrega con un default temporal que después se saca (Prisma
-- lo maneja con @updatedAt, sin default en la DB).

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'STATE';
ALTER TYPE "AuditEntity" ADD VALUE 'CITY';

-- AlterTable
ALTER TABLE "cities" ADD COLUMN     "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_by" TEXT;
ALTER TABLE "cities" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "states" ADD COLUMN     "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_by" TEXT;
ALTER TABLE "states" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "states" ADD CONSTRAINT "states_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "states" ADD CONSTRAINT "states_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A mano (Prisma no los soporta) --------------------------------------------

ALTER TABLE "states"
  ADD CONSTRAINT "state_name_not_blank_chk" CHECK (btrim("name") <> '');

ALTER TABLE "cities"
  ADD CONSTRAINT "city_name_not_blank_chk" CHECK (btrim("name") <> '');
