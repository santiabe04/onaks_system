import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction, AuditEntity } from "@/generated/prisma/enums";
import { toAuditJson } from "./audit-data";
import { db } from "./db";
import { getRequestContext } from "./request-context";

export type AuditEvent = {
  action: AuditAction;
  /** Quién lo hizo. Null si no hay sesión (p. ej. un login fallido). */
  actorUserId?: string | null;
  entityType?: AuditEntity;
  entityId?: string | number;
  /** Snapshots de la fila: se guardan sin campos sensibles (ver `audit-data`). */
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

/**
 * Registra un evento con la IP y el user agent del request. Para cambios de
 * datos, pasar el `tx` de la transacción: si el cambio falla, tampoco queda el
 * registro, y si el registro falla, el cambio se deshace.
 */
export async function audit(
  client: Prisma.TransactionClient | typeof db,
  event: AuditEvent,
): Promise<void> {
  const { ip, userAgent } = await getRequestContext();
  await client.auditLog.create({
    data: {
      action: event.action,
      actorUserId: event.actorUserId ?? null,
      entityType: event.entityType ?? null,
      entityId: event.entityId === undefined ? null : String(event.entityId),
      before: toAuditJson(event.before),
      after: toAuditJson(event.after),
      metadata: toAuditJson(event.metadata),
      ip,
      userAgent,
    },
  });
}
