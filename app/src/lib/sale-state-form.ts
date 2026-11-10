import { SaleState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { isCuid } from "./ids";

// Pure: the status change form of an order.

export const STATE_COMMENT_MAX_LENGTH = 200;

type Messages = Dictionary["adminOrders"]["stateChange"]["errors"];

export type StateChangeInput = {
  /** The status the admin saw: if it already changed, it is rejected. */
  from: SaleState;
  to: SaleState;
  /** Warehouse for the whole order (when deducting stock). */
  warehouseId: string | null;
  /** Warehouse per product, if a different one was chosen. */
  itemWarehouses: Record<string, string>;
  comment: string | null;
};

export type StateChangeFormState = { error?: string; savedAt?: number };

function stateValue(raw: FormDataEntryValue | null): SaleState | null {
  return typeof raw === "string" &&
    (Object.values(SaleState) as string[]).includes(raw)
    ? (raw as SaleState)
    : null;
}

export function parseStateChangeForm(
  formData: FormData,
  t: Messages,
): { ok: true; data: StateChangeInput } | { ok: false; error: string } {
  const from = stateValue(formData.get("from"));
  const to = stateValue(formData.get("to"));
  if (!from) return { ok: false, error: t.invalid };
  if (!to) return { ok: false, error: t.targetRequired };

  const warehouse = formData.get("warehouse");
  const itemWarehouses: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    const productId = key.startsWith("warehouse_") ? key.slice(10) : null;
    if (productId && isCuid(productId) && isCuid(value)) {
      itemWarehouses[productId] = value;
    }
  }

  const rawComment = formData.get("comment");
  const comment = typeof rawComment === "string" ? rawComment.trim() : "";
  if (comment.length > STATE_COMMENT_MAX_LENGTH) {
    return {
      ok: false,
      error: interpolate(t.commentTooLong, { max: STATE_COMMENT_MAX_LENGTH }),
    };
  }

  return {
    ok: true,
    data: {
      from,
      to,
      warehouseId: isCuid(warehouse) ? warehouse : null,
      itemWarehouses,
      comment: comment || null,
    },
  };
}

/**
 * Which warehouse each product comes from: the one chosen for that product or, if not,
 * the order's one. null if any is missing.
 */
export function resolveWarehouses(
  productIds: string[],
  input: Pick<StateChangeInput, "warehouseId" | "itemWarehouses">,
): Record<string, string> | null {
  const result: Record<string, string> = {};
  for (const productId of productIds) {
    const warehouseId = input.itemWarehouses[productId] ?? input.warehouseId;
    if (!warehouseId) return null;
    result[productId] = warehouseId;
  }
  return result;
}

/** Cap on orders in a bulk change (a whole zone fits easily). */
export const BULK_MAX_SALES = 200;

export type BulkStateChangeInput = {
  /** Each order with the status the admin saw (to reject if it changed). */
  sales: { id: string; from: SaleState }[];
  to: SaleState;
  warehouseId: string | null;
  comment: string | null;
};

export type BulkStateChangeState = {
  error?: string;
  results?: { number: number; error?: string }[];
  savedAt?: number;
};

/** The checkboxes come as "id:STATUS"; repeated or invalid ones are discarded. */
export function parseBulkStateChangeForm(
  formData: FormData,
  t: Messages,
): { ok: true; data: BulkStateChangeInput } | { ok: false; error: string } {
  const seen = new Set<string>();
  const sales: BulkStateChangeInput["sales"] = [];
  for (const raw of formData.getAll("sale")) {
    if (typeof raw !== "string") continue;
    const [id, state] = raw.split(":");
    const from = stateValue(state ?? null);
    if (!isCuid(id) || !from || seen.has(id)) continue;
    seen.add(id);
    sales.push({ id, from });
  }
  if (sales.length === 0) return { ok: false, error: t.noneSelected };
  if (sales.length > BULK_MAX_SALES) {
    return {
      ok: false,
      error: interpolate(t.tooMany, { max: BULK_MAX_SALES }),
    };
  }

  // The rest is validated the same way as the individual change.
  const single = new FormData();
  single.set("from", sales[0].from);
  for (const key of ["to", "warehouse", "comment"]) {
    const value = formData.get(key);
    if (typeof value === "string") single.set(key, value);
  }
  const parsed = parseStateChangeForm(single, t);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    data: {
      sales,
      to: parsed.data.to,
      warehouseId: parsed.data.warehouseId,
      comment: parsed.data.comment,
    },
  };
}
