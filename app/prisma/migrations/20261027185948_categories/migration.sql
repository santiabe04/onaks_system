-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'CATEGORY';

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_categories_parent_id" ON "categories"("parent_id");

-- CreateIndex
-- A mano: NULLS NOT DISTINCT para que el nombre también sea único entre las
-- categorías raíz (parent_id NULL). Prisma no lo soporta en el schema.
CREATE UNIQUE INDEX "categories_parent_id_name_key" ON "categories"("parent_id", "name") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A mano (Prisma no los soporta) --------------------------------------------

ALTER TABLE "categories"
  ADD CONSTRAINT "category_not_own_parent_chk" CHECK ("parent_id" <> "id"),
  ADD CONSTRAINT "category_name_not_blank_chk" CHECK (btrim("name") <> '');