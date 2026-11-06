-- Notas de crédito al cliente: devoluciones de mercadería (con stock) y ajustes por
-- importe. Se imputan en la cuenta corriente como un cobro.

-- CreateEnum
CREATE TYPE "CustomerCreditNoteKind" AS ENUM ('RETURN', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ReturnDestination" AS ENUM ('RESTOCK', 'WRITE_OFF');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'CUSTOMER_CREDIT_NOTE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'CUSTOMER_RETURN';
ALTER TYPE "StockMovementType" ADD VALUE 'CUSTOMER_RETURN_REVERSAL';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "customer_credit_note_id" TEXT;

-- CreateTable
CREATE TABLE "customer_credit_notes" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sale_id" TEXT,
    "kind" "CustomerCreditNoteKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "warehouse_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" TEXT,
    "void_reason" VARCHAR(200),

    CONSTRAINT "customer_credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_credit_note_items" (
    "credit_note_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "unit_tax_rate" DECIMAL(5,4) NOT NULL,
    "unit_cost" DECIMAL(12,2),
    "destination" "ReturnDestination" NOT NULL,

    CONSTRAINT "customer_credit_note_items_pkey" PRIMARY KEY ("credit_note_id","product_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_credit_notes_number_key" ON "customer_credit_notes"("number");

-- CreateIndex
CREATE INDEX "idx_customer_credit_notes_customer_id_created_at" ON "customer_credit_notes"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_customer_credit_notes_sale_id" ON "customer_credit_notes"("sale_id");

-- CreateIndex
CREATE INDEX "idx_customer_credit_note_items_product_id" ON "customer_credit_note_items"("product_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_customer_credit_note_id" ON "stock_movements"("customer_credit_note_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_customer_credit_note_id_fkey" FOREIGN KEY ("customer_credit_note_id") REFERENCES "customer_credit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_notes" ADD CONSTRAINT "customer_credit_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_notes" ADD CONSTRAINT "customer_credit_notes_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_notes" ADD CONSTRAINT "customer_credit_notes_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_notes" ADD CONSTRAINT "customer_credit_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_notes" ADD CONSTRAINT "customer_credit_notes_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_note_items" ADD CONSTRAINT "customer_credit_note_items_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "customer_credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_note_items" ADD CONSTRAINT "customer_credit_note_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Checks (Prisma no los soporta).
ALTER TABLE "customer_credit_notes"
  ADD CONSTRAINT "customer_credit_note_amount_positive_chk" CHECK ("amount" > 0),
  -- Una devolución tiene pedido y depósito; un ajuste, ninguno de los dos.
  ADD CONSTRAINT "customer_credit_note_kind_fields_chk" CHECK (
    ("kind" = 'RETURN' AND "sale_id" IS NOT NULL AND "warehouse_id" IS NOT NULL)
    OR ("kind" = 'ADJUSTMENT' AND "sale_id" IS NULL AND "warehouse_id" IS NULL)
  ),
  -- Anulada = con fecha, quién y motivo, las tres cosas o ninguna.
  ADD CONSTRAINT "customer_credit_note_void_fields_chk" CHECK (
    ("voided_at" IS NULL AND "voided_by" IS NULL AND "void_reason" IS NULL)
    OR ("voided_at" IS NOT NULL AND "voided_by" IS NOT NULL AND "void_reason" IS NOT NULL)
  );
ALTER TABLE "customer_credit_note_items"
  ADD CONSTRAINT "customer_credit_note_item_quantity_positive_chk" CHECK ("quantity" > 0),
  ADD CONSTRAINT "customer_credit_note_item_unit_cost_not_negative_chk" CHECK ("unit_cost" IS NULL OR "unit_cost" >= 0);

-- El ingreso de una devolución suma y su reversión resta (se compara como texto:
-- los valores nuevos del enum no se pueden usar en la misma transacción que los crea).
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movement_direction_chk";
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movement_direction_chk" CHECK (
    ("type"::text IN ('ENTRY', 'TRANSFER_IN', 'SALE_RETURN', 'PURCHASE_RECEIPT', 'CUSTOMER_RETURN') AND "quantity" > 0)
    OR ("type"::text IN ('WRITE_OFF', 'TRANSFER_OUT', 'SALE', 'PURCHASE_RECEIPT_REVERSAL', 'CUSTOMER_RETURN_REVERSAL') AND "quantity" < 0)
    OR "type"::text = 'ADJUSTMENT'
  );
