-- Acciones de auditoría para la gestión de usuarios del admin.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_RESET';
ALTER TYPE "AuditAction" ADD VALUE 'LOGIN_UNLOCK';
