import type { Prisma } from "@/generated/prisma/client";
import { AuditAction, AuditEntity } from "@/generated/prisma/enums";

// Puro: arma los filtros del visor de auditoría a partir de la URL.

export const AUDIT_PAGE_SIZE = 50;

// Las fechas del filtro son días calendario de Argentina, que no tiene horario
// de verano: el offset es fijo.
const TZ_OFFSET = "-03:00";
const DAY_MS = 24 * 60 * 60 * 1000;

export type AuditFilters = {
  actor?: string;
  entity?: AuditEntity;
  action?: AuditAction;
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

function oneOf<T extends string>(
  values: Record<string, T>,
  raw: string | undefined,
): T | undefined {
  return raw && (Object.values(values) as string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

function dayStart(raw: string | undefined): Date | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const date = new Date(`${raw}T00:00:00${TZ_OFFSET}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Lo que no se entiende se ignora: una URL editada a mano no rompe la página. */
export function parseAuditFilters(params: SearchParams): AuditFilters {
  const actor = first(params.actor);
  const from = first(params.from);
  const to = first(params.to);
  const page = Number.parseInt(first(params.page) ?? "", 10);
  return {
    actor: actor && actor.length <= 64 ? actor : undefined,
    entity: oneOf(AuditEntity, first(params.entity)),
    action: oneOf(AuditAction, first(params.action)),
    from: dayStart(from) ? from : undefined,
    to: dayStart(to) ? to : undefined,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

export function auditWhere(filters: AuditFilters): Prisma.AuditLogWhereInput {
  const from = dayStart(filters.from);
  const to = dayStart(filters.to);
  return {
    actorUserId: filters.actor,
    entityType: filters.entity,
    action: filters.action,
    createdAt:
      from || to
        ? {
            gte: from,
            // `to` es inclusive: hasta el comienzo del día siguiente.
            lt: to ? new Date(to.getTime() + DAY_MS) : undefined,
          }
        : undefined,
  };
}

/** Query string con los mismos filtros y otra página (para los links). */
export function auditQuery(filters: AuditFilters, page: number): string {
  const params = new URLSearchParams();
  for (const key of ["actor", "entity", "action", "from", "to"] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
