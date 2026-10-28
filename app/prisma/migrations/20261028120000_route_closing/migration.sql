-- Cierre de la hoja de ruta: rendición de efectivo del repartidor.


-- AlterTable
ALTER TABLE "route_sheets" ADD COLUMN     "cash_expected" DECIMAL(12,2),
ADD COLUMN     "cash_received" DECIMAL(12,2),
ADD COLUMN     "closed_by" TEXT,
ADD COLUMN     "closing_notes" VARCHAR(300);

-- AddForeignKey
ALTER TABLE "route_sheets" ADD CONSTRAINT "route_sheets_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- La rendición va junto con el cierre: cerrada tiene montos y quién cerró;
-- abierta, nada. Montos no negativos.
ALTER TABLE "route_sheets"
  ADD CONSTRAINT "route_sheet_closing_chk" CHECK (
    ("state" = 'CLOSED' AND "cash_expected" IS NOT NULL AND "cash_received" IS NOT NULL
      AND "closed_by" IS NOT NULL)
    OR ("state" <> 'CLOSED' AND "cash_expected" IS NULL AND "cash_received" IS NULL
      AND "closed_by" IS NULL AND "closing_notes" IS NULL)
  ),
  ADD CONSTRAINT "route_sheet_cash_non_negative_chk" CHECK (
    ("cash_expected" IS NULL OR "cash_expected" >= 0)
    AND ("cash_received" IS NULL OR "cash_received" >= 0)
  );
