-- Avisos por mail al cliente por los cambios de estado de su pedido (cola + registro).

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "order_notifications" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "event" "SaleState" NOT NULL,
    "to_mail" TEXT NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimed_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(300),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_order_notifications_status" ON "order_notifications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "order_notifications_sale_id_event_key" ON "order_notifications"("sale_id", "event");

-- AddForeignKey
ALTER TABLE "order_notifications" ADD CONSTRAINT "order_notifications_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CHECK: los intentos no son negativos.
ALTER TABLE "order_notifications" ADD CONSTRAINT "chk_order_notifications_attempts" CHECK ("attempts" >= 0);
