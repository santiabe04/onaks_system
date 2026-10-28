-- Hojas de ruta: repartos con paradas en orden.


-- CreateEnum
CREATE TYPE "RouteSheetState" AS ENUM ('DRAFT', 'OUT', 'CLOSED');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'ROUTE_SHEET';

-- CreateTable
CREATE TABLE "route_sheets" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "driver_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "state" "RouteSheetState" NOT NULL DEFAULT 'DRAFT',
    "notes" VARCHAR(300),
    "departed_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "route_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" TEXT NOT NULL,
    "route_sheet_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "route_sheets_number_key" ON "route_sheets"("number");

-- CreateIndex
CREATE INDEX "idx_route_sheets_state_date" ON "route_sheets"("state", "date");

-- CreateIndex
CREATE INDEX "idx_route_sheets_driver_id_date" ON "route_sheets"("driver_id", "date");

-- CreateIndex
CREATE INDEX "idx_route_stops_sale_id" ON "route_stops"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_route_sheet_id_sale_id_key" ON "route_stops"("route_sheet_id", "sale_id");

-- AddForeignKey
ALTER TABLE "route_sheets" ADD CONSTRAINT "route_sheets_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_sheets" ADD CONSTRAINT "route_sheets_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_sheets" ADD CONSTRAINT "route_sheets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_sheets" ADD CONSTRAINT "route_sheets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_sheet_id_fkey" FOREIGN KEY ("route_sheet_id") REFERENCES "route_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Orden de visita desde 1, y las fechas de salida y cierre según el estado.
ALTER TABLE "route_stops"
  ADD CONSTRAINT "route_stop_position_positive_chk" CHECK ("position" > 0);
ALTER TABLE "route_sheets"
  ADD CONSTRAINT "route_sheet_state_dates_chk" CHECK (
    ("state" = 'DRAFT' AND "departed_at" IS NULL AND "closed_at" IS NULL)
    OR ("state" = 'OUT' AND "departed_at" IS NOT NULL AND "closed_at" IS NULL)
    OR ("state" = 'CLOSED' AND "departed_at" IS NOT NULL AND "closed_at" IS NOT NULL)
  );
