import type { Prisma } from "@/generated/prisma/client";

// Pure: used by `lib/audit`, the audit viewer and the tests.

// They never go to the log, even if the row's snapshot includes them.
const REDACTED_KEYS = new Set(["passwordHash"]);

// They change on every modification: in the detail they only add noise.
const IGNORED_IN_DIFF = new Set(["updatedAt", "updatedById"]);

/**
 * Converts a snapshot to storable JSON: dates to ISO, Decimal to string and without
 * sensitive fields. `undefined` (or null) stores nothing.
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

/** Fields that changed between two snapshots (for the detail of an UPDATE). */
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
 * Client IP. The first value of `x-forwarded-for` is the client and the
 * rest are intermediate proxies. If the app were exposed without a reverse proxy, a
 * client could forge it: that is why the login lock also counts by email.
 */
export function parseClientIp(
  forwardedFor: string | null,
  realIp: string | null,
): string | null {
  const first = forwardedFor?.split(",")[0]?.trim();
  return first || realIp?.trim() || null;
}
