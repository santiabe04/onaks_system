import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput } from "./decimal-input";
import { isCuid } from "./ids";
import { fromMilli, QUANTITY_LIMITS, toMilli } from "./quantity";

// Pure: inventory count of a warehouse (entered blind from the phone).

export const COUNT_NOTES_MAX_LENGTH = 300;
export const COUNT_CODE_MAX_LENGTH = 60;
const ZERO = BigInt(0);
const THOUSAND = BigInt(1000);

type Messages = Dictionary["stockCount"]["errors"];

/** Typed or scanned code: no extra spaces (a reader often adds a line break). */
export function normalizeCountCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

/**
 * Looks up a product by barcode or SKU (the SKU is in uppercase). A
 * barcode takes priority over an identical SKU of another product.
 */
export function matchProductByCode<
  T extends { barcode: string | null; sku: string },
>(code: string, products: T[]): T | null {
  const value = normalizeCountCode(code);
  if (!value) return null;
  return (
    products.find((product) => product.barcode === value) ??
    products.find((product) => product.sku === value.toUpperCase()) ??
    null
  );
}

/** New count: warehouse and optional note. */
export function parseCountRequest(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: { warehouseId: string; notes: string | null } }
  | { ok: false; error: string } {
  const warehouseId = formData.get("warehouseId");
  if (!isCuid(warehouseId)) return { ok: false, error: t.warehouse };
  const raw = formData.get("notes");
  const notes = typeof raw === "string" ? raw.trim() : "";
  if (notes.length > COUNT_NOTES_MAX_LENGTH) {
    return { ok: false, error: t.notes };
  }
  return { ok: true, data: { warehouseId, notes: notes || null } };
}

export type CountEntry = {
  code: string;
  /** "add" adds to what was already counted; "set" replaces it (correcting a mistake). */
  mode: "add" | "set";
  quantity: string;
};

/** A scan or correction: code, mode and quantity. */
export function parseCountEntry(
  formData: FormData,
  t: Messages,
): { ok: true; data: CountEntry } | { ok: false; error: string } {
  const code = normalizeCountCode(String(formData.get("code") ?? ""));
  if (!code || code.length > COUNT_CODE_MAX_LENGTH) {
    return { ok: false, error: t.code };
  }
  const mode = formData.get("mode") === "set" ? "set" : "add";
  const quantity = parseDecimalInput(
    String(formData.get("quantity") ?? ""),
    QUANTITY_LIMITS,
  );
  if (quantity === null) return { ok: false, error: t.quantity };
  // Adding zero changes nothing; setting zero does (the shelf is empty).
  if (mode === "add" && toMilli(quantity) === ZERO) {
    return { ok: false, error: t.quantity };
  }
  return { ok: true, data: { code, mode, quantity } };
}

/** Does the quantity fit the product's unit? (kg and l allow decimals, u does not). */
export function quantityFitsUnit(
  quantity: string,
  allowsDecimals: boolean,
): boolean {
  return allowsDecimals || toMilli(quantity) % THOUSAND === ZERO;
}

/** What remains counted after a scan. */
export function applyCountEntry(
  current: string | null,
  entry: Pick<CountEntry, "mode" | "quantity">,
): string {
  if (entry.mode === "set" || current === null) return entry.quantity;
  return fromMilli(toMilli(current) + toMilli(entry.quantity));
}

/** Signed difference: counted − balance there was when counting ("-3", "0", "2.5"). */
export function countDifference(counted: string, expected: string): string {
  return fromMilli(toMilli(counted) - toMilli(expected));
}

export type CountLine = { counted: string; expected: string };

/** Summary to review: how many products match and how many have a difference. */
export function summarizeCount(lines: CountLine[]): {
  total: number;
  matching: number;
  surplus: number;
  missing: number;
} {
  let matching = 0;
  let surplus = 0;
  let missing = 0;
  for (const line of lines) {
    const diff = toMilli(line.counted) - toMilli(line.expected);
    if (diff === ZERO) matching += 1;
    else if (diff > ZERO) surplus += 1;
    else missing += 1;
  }
  return { total: lines.length, matching, surplus, missing };
}
