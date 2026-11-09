-- Pago por transferencia: datos de cobro de la distribuidora y comprobantes que
-- sube el cliente (se validan o se rechazan desde el admin).

-- CreateEnum
CREATE TYPE "TransferProofState" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEntity" ADD VALUE 'TRANSFER_SETTINGS';
ALTER TYPE "AuditEntity" ADD VALUE 'TRANSFER_PROOF';

-- CreateTable
CREATE TABLE "transfer_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "bank_name" VARCHAR(60) NOT NULL,
    "holder" VARCHAR(80) NOT NULL,
    "cuit" VARCHAR(11) NOT NULL,
    "cbu" VARCHAR(22),
    "alias" VARCHAR(20),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "transfer_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_proofs" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "state" "TransferProofState" NOT NULL DEFAULT 'PENDING',
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by" TEXT,
    "reject_reason" VARCHAR(200),
    "payment_id" TEXT,

    CONSTRAINT "transfer_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transfer_proofs_payment_id_key" ON "transfer_proofs"("payment_id");

-- CreateIndex
CREATE INDEX "idx_transfer_proofs_sale_id" ON "transfer_proofs"("sale_id");

-- CreateIndex
CREATE INDEX "idx_transfer_proofs_state" ON "transfer_proofs"("state");

-- AddForeignKey
ALTER TABLE "transfer_settings" ADD CONSTRAINT "transfer_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_proofs" ADD CONSTRAINT "transfer_proofs_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_proofs" ADD CONSTRAINT "transfer_proofs_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_proofs" ADD CONSTRAINT "transfer_proofs_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_proofs" ADD CONSTRAINT "transfer_proofs_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "customer_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Checks (Prisma no los soporta).
ALTER TABLE "transfer_settings"
  ADD CONSTRAINT "transfer_settings_single_row_chk" CHECK ("id" = 1),
  -- Hace falta al menos un dato para transferir.
  ADD CONSTRAINT "transfer_settings_cbu_or_alias_chk" CHECK ("cbu" IS NOT NULL OR "alias" IS NOT NULL),
  ADD CONSTRAINT "transfer_settings_cbu_format_chk" CHECK ("cbu" IS NULL OR "cbu" ~ '^[0-9]{22}$'),
  ADD CONSTRAINT "transfer_settings_cuit_format_chk" CHECK ("cuit" ~ '^[0-9]{11}$');
ALTER TABLE "transfer_proofs"
  -- Rechazado si y solo si tiene motivo; validado si y solo si generó un cobro.
  ADD CONSTRAINT "transfer_proof_reject_reason_chk" CHECK (("state"::text = 'REJECTED') = ("reject_reason" IS NOT NULL)),
  ADD CONSTRAINT "transfer_proof_payment_chk" CHECK (("state"::text = 'VALIDATED') = ("payment_id" IS NOT NULL)),
  -- Revisado (validado o rechazado) si y solo si tiene fecha y quién.
  ADD CONSTRAINT "transfer_proof_review_chk" CHECK (
    ("state"::text = 'PENDING' AND "reviewed_at" IS NULL AND "reviewed_by" IS NULL)
    OR ("state"::text <> 'PENDING' AND "reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)
  );
