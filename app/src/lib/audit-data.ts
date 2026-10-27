import type { Prisma } from "@/generated/prisma/client";

// Puro: lo usan `lib/audit`, el visor de auditoría y los tests.

// Nunca van al registro, aunque el snapshot de la fila los traiga.
const REDACTED_KEYS = new Set(["passwordHash"]);

// Cambian en toda modificación: en el detalle solo meten ruido.
const IGNORED_IN_DIFF = new Set(["updatedAt", "updatedById"]);

/**
 * Convierte un snapshot a JSON guardable: fechas a ISO, Decimal a string y sin
 * campos sensibles. `undefined` (o null) no guarda nada.
 */
export function toAuditJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v: unknown) =>
      REDACTED_KEYS.has(key) ? undefined : v,
    ),
  ) as Prisma.InputJsonValue;
}

export type FieldChange = { field: string; before: unknown; after: unknown };

/** Campos que cambiaron entre dos snapshots (para el detalle de un UPDATE). */
export function changedFields(before: unknown, after: unknown): FieldChange[] {
  const a = isRecord(before) ? before : {};
  const b = isRecord(after) ? after : {};
  const fields = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...fields]
    .filter((field) => !IGNORED_IN_DIFF.has(field))
    .filter((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]))
    .map((field) => ({ field, before: a[field], after: b[field] }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * IP del cliente. El primer valor de `x-forwarded-for` es el cliente y los
 * demás, proxies intermedios. Si la app quedara expuesta sin reverse proxy, un
 * cliente podría falsearla: por eso el bloqueo de login también cuenta por mail.
 */
export function parseClientIp(
  forwardedFor: string | null,
  realIp: string | null,
): string | null {
  const first = forwardedFor?.split(",")[0]?.trim();
  return first || realIp?.trim() || null;
}
