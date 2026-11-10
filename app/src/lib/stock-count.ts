import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput } from "./decimal-input";
import { isCuid } from "./ids";
import { fromMilli, QUANTITY_LIMITS, toMilli } from "./quantity";

// Puro: conteo de inventario de un depósito (se carga a ciegas desde el celular).

export const COUNT_NOTES_MAX_LENGTH = 300;
export const COUNT_CODE_MAX_LENGTH = 60;
const ZERO = BigInt(0);
const THOUSAND = BigInt(1000);

type Messages = Dictionary["stockCount"]["errors"];

/** Código tipeado o escaneado: sin espacios de más (un lector suele sumar un salto). */
export function normalizeCountCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

/**
 * Busca un producto por código de barras o SKU (el SKU va en mayúsculas). Un
 * código de barras tiene prioridad sobre un SKU igual de otro producto.
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

/** Conteo nuevo: depósito y nota opcional. */
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
  /** "add" suma a lo ya contado; "set" lo reemplaza (corregir un error). */
  mode: "add" | "set";
  quantity: string;
};

/** Un escaneo o corrección: código, modo y cantidad. */
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
  // Sumar cero no cambia nada; fijar cero sí (el estante está vacío).
  if (mode === "add" && toMilli(quantity) === ZERO) {
    return { ok: false, error: t.quantity };
  }
  return { ok: true, data: { code, mode, quantity } };
}

/** ¿La cantidad cabe en la unidad del producto? (kg y l admiten decimales, u no). */
export function quantityFitsUnit(
  quantity: string,
  allowsDecimals: boolean,
): boolean {
  return allowsDecimals || toMilli(quantity) % THOUSAND === ZERO;
}

/** Lo que queda contado después de un escaneo. */
export function applyCountEntry(
  current: string | null,
  entry: Pick<CountEntry, "mode" | "quantity">,
): string {
  if (entry.mode === "set" || current === null) return entry.quantity;
  return fromMilli(toMilli(current) + toMilli(entry.quantity));
}

/** Diferencia con signo: contado − saldo que había al contar ("-3", "0", "2.5"). */
export function countDifference(counted: string, expected: string): string {
  return fromMilli(toMilli(counted) - toMilli(expected));
}

export type CountLine = { counted: string; expected: string };

/** Resumen para revisar: cuántos productos coinciden y cuántos tienen diferencia. */
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
