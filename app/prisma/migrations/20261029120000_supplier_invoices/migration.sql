-- Facturas de proveedores por OC, con el control de 3 vías (OC, recepciones y
-- factura) y la aprobación de las que tienen diferencias.

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "SupplierInvoiceState" AS ENUM ('FLAGGED', 'APPROVED', 'ANNULLED');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'SUPPLIER_INVOICE';

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "point_of_sale" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "issue_date" DATE NOT NULL,
    "due_date" DATE,
    "sub_total" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL,
    "vat_perception" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "iibb_perception" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_taxes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "printed_total" DECIMAL(12,2) NOT NULL,
    "differences" JSONB NOT NULL DEFAULT '[]',
    "notes" VARCHAR(300),
    "state" "SupplierInvoiceState" NOT NULL,
    "approval_note" VARCHAR(300),
    "approved_at" TIMESTAMPTZ(3),
    "approved_by" TEXT,
    "annulled_at" TIMESTAMPTZ(3),
    "annul_reason" VARCHAR(300),
    "annulled_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoice_items" (
    "invoice_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(5,4) NOT NULL,

    CONSTRAINT "supplier_invoice_items_pkey" PRIMARY KEY ("invoice_id","product_id")
);

-- CreateIndex
CREATE INDEX "idx_supplier_invoices_purchase_order_id" ON "supplier_invoices"("purchase_order_id");

-- CreateIndex
CREATE INDEX "idx_supplier_invoices_supplier_id_number" ON "supplier_invoices"("supplier_id", "type", "point_of_sale", "number");

-- CreateIndex
CREATE INDEX "idx_supplier_invoices_state" ON "supplier_invoices"("state");

-- CreateIndex
CREATE INDEX "idx_supplier_invoice_items_product_id" ON "supplier_invoice_items"("product_id");

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_annulled_by_fkey" FOREIGN KEY ("annulled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoice_items" ADD CONSTRAINT "supplier_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoice_items" ADD CONSTRAINT "supplier_invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Comprobante válido: punto de venta de 5 dígitos y número de 8.
ALTER TABLE "supplier_invoices"
  ADD CONSTRAINT "supplier_invoice_number_chk" CHECK (
    "point_of_sale" BETWEEN 1 AND 99999 AND "number" BETWEEN 1 AND 99999999
  );

-- Importes no negativos, el total cierra y el vencimiento no es anterior a la fecha.
ALTER TABLE "supplier_invoices"
  ADD CONSTRAINT "supplier_invoice_amounts_chk" CHECK (
    "sub_total" >= 0 AND "tax" >= 0 AND "vat_perception" >= 0 AND "iibb_perception" >= 0
    AND "other_taxes" >= 0 AND "printed_total" >= 0
    AND "total" = "sub_total" + "tax" + "vat_perception" + "iibb_perception" + "other_taxes"
    AND ("due_date" IS NULL OR "due_date" >= "issue_date")
  );

-- Aprobada lleva quién y cuándo; anulada lleva fecha y motivo.
ALTER TABLE "supplier_invoices"
  ADD CONSTRAINT "supplier_invoice_state_chk" CHECK (
    ("state" <> 'APPROVED' OR "approved_at" IS NOT NULL)
    AND ("state" <> 'FLAGGED' OR "approved_at" IS NULL)
    AND (("state" = 'ANNULLED') = ("annulled_at" IS NOT NULL AND "annul_reason" IS NOT NULL))
  );

ALTER TABLE "supplier_invoice_items"
  ADD CONSTRAINT "supplier_invoice_item_values_chk" CHECK (
    "quantity" > 0 AND "unit_cost" >= 0 AND "tax_rate" >= 0
  );
