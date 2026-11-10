import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction, AuditEntity } from "@/generated/prisma/enums";
import { toAuditJson } from "./audit-data";
import { db } from "./db";
import { getRequestContext } from "./request-context";

export type AuditEvent = {
  action: AuditAction;
  /** Who did it. Null if there is no session (e.g. a failed login). */
  actorUserId?: string | null;
  entityType?: AuditEntity;
  entityId?: string | number;
  /** Row snapshots: stored without sensitive fields (see `audit-data`). */
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

/**
 * Records an event with the IP and user agent of the request. For data
 * changes, pass the transaction's `tx`: if the change fails, the record does not remain either,
 * and if the record fails, the change is rolled back.
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
