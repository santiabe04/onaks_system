/** The IDs of the business tables are CUID2: it is enough to discard what obviously is not one. */
export function isCuid(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{1,32}$/.test(value);
}
