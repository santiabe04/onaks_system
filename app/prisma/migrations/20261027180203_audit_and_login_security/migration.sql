-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGIN_LOCKED', 'LOGOUT', 'PASSWORD_CHANGE', 'ACCESS_DENIED');

-- CreateEnum
CREATE TYPE "AuditEntity" AS ENUM ('MEASUREMENT_UNIT', 'PRODUCT', 'CUSTOMER', 'PERSON', 'PERSON_ADDRESS', 'USER', 'DISCOUNT', 'SALE');

-- AlterTable
ALTER TABLE "measurement_units" ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "updated_by" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "session_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity_type" "AuditEntity",
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "mail" TEXT NOT NULL,
    "ip" TEXT,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_audit_logs_actor_user_id_created_at" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_audit_logs_entity_type_entity_id" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_action_created_at" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "idx_login_attempts_mail_created_at" ON "login_attempts"("mail", "created_at");

-- CreateIndex
CREATE INDEX "idx_login_attempts_mail_ip_created_at" ON "login_attempts"("mail", "ip", "created_at");

-- AddForeignKey
ALTER TABLE "measurement_units" ADD CONSTRAINT "measurement_units_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_units" ADD CONSTRAINT "measurement_units_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A mano (Prisma no los soporta) --------------------------------------------

ALTER TABLE "users" ADD CONSTRAINT "chk_users_session_version" CHECK ("session_version" >= 0);

-- audit_logs es solo de inserción: un UPDATE, DELETE o TRUNCATE falla aunque
-- venga de un bug en el código o de alguien con acceso a la app.
CREATE FUNCTION "audit_logs_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es solo de inserción';
END;
$$;

CREATE TRIGGER "trg_audit_logs_no_update_delete"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "audit_logs_append_only"();

CREATE TRIGGER "trg_audit_logs_no_truncate"
BEFORE TRUNCATE ON "audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_append_only"();