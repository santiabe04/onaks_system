-- Carga por parada: entregado / no entregado, firma o foto, ubicación y cobro.


-- CreateEnum
CREATE TYPE "RouteStopStatus" AS ENUM ('PENDING', 'DELIVERED', 'NOT_DELIVERED');

-- AlterTable
ALTER TABLE "route_stops" ADD COLUMN     "accuracy_meters" INTEGER,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "not_delivered_reason" VARCHAR(200),
ADD COLUMN     "payment_id" TEXT,
ADD COLUMN     "photo_file" TEXT,
ADD COLUMN     "receiver_dni" VARCHAR(15),
ADD COLUMN     "receiver_name" VARCHAR(80),
ADD COLUMN     "recorded_at" TIMESTAMPTZ(3),
ADD COLUMN     "recorded_by" TEXT,
ADD COLUMN     "signature_file" TEXT,
ADD COLUMN     "status" "RouteStopStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_payment_id_key" ON "route_stops"("payment_id");

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "customer_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Lo que se carga según el resultado de la parada:
-- entregado lleva firma (con aclaración) o foto del remito; no entregado, el motivo.
ALTER TABLE "route_stops"
  ADD CONSTRAINT "route_stop_record_chk" CHECK (
    ("status" = 'PENDING'
      AND "recorded_at" IS NULL AND "signature_file" IS NULL AND "photo_file" IS NULL
      AND "not_delivered_reason" IS NULL AND "payment_id" IS NULL)
    OR ("status" = 'DELIVERED' AND "recorded_at" IS NOT NULL
      AND ("signature_file" IS NOT NULL OR "photo_file" IS NOT NULL)
      AND ("signature_file" IS NULL OR "receiver_name" IS NOT NULL)
      AND "not_delivered_reason" IS NULL)
    OR ("status" = 'NOT_DELIVERED' AND "recorded_at" IS NOT NULL
      AND "not_delivered_reason" IS NOT NULL)
  ),
  ADD CONSTRAINT "route_stop_location_chk" CHECK (
    ("latitude" IS NULL) = ("longitude" IS NULL)
    AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
    AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
  );
