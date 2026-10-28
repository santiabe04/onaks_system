import { SaleState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { isCuid } from "./ids";

// Puro: el formulario de cambio de estado de un pedido.

export const STATE_COMMENT_MAX_LENGTH = 200;

type Messages = Dictionary["adminOrders"]["stateChange"]["errors"];

export type StateChangeInput = {
  /** El estado que vio el admin: si ya cambió, se rechaza. */
  from: SaleState;
  to: SaleState;
  /** Depósito para todo el pedido (al descontar stock). */
  warehouseId: string | null;
  /** Depósito por producto, si se eligió uno distinto. */
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
 * De qué depósito sale cada producto: el elegido para ese producto o, si no,
 * el del pedido. null si a alguno le falta.
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
