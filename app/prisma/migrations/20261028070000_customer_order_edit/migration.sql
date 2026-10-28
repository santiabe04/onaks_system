-- El cliente puede modificar un pedido Pendiente si el admin lo habilita.


-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "customer_can_edit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "editing_person_id" TEXT;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_editing_person_id_fkey" FOREIGN KEY ("editing_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Solo se modifica con permiso, y una persona modifica un pedido a la vez
-- (el carrito es uno solo). Índice parcial escrito a mano.
ALTER TABLE "sales"
  ADD CONSTRAINT "sale_editing_needs_permission_chk"
  CHECK ("editing_person_id" IS NULL OR "customer_can_edit");
CREATE UNIQUE INDEX "sales_editing_person_id_key"
  ON "sales"("editing_person_id") WHERE "editing_person_id" IS NOT NULL;
