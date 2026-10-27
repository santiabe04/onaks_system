import { z } from "zod";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput } from "./decimal-input";
import { isCuid } from "./ids";
import { fromMilli, QUANTITY_LIMITS, toMilli } from "./quantity";

// Puro: validación de movimientos manuales de stock y cálculo de sus patas.

/** Lo que se elige en el form; la transferencia genera dos movimientos (OUT/IN). */
export const MANUAL_MOVEMENTS = [
  "ENTRY",
  "ADJUSTMENT",
  "WRITE_OFF",
  "TRANSFER",
] as const;
export type ManualMovement = (typeof MANUAL_MOVEMENTS)[number];

export const STOCK_COMMENT_MAX_LENGTH = 200;

/** Ajustes y bajas tienen que explicar el porqué. */
export function commentRequired(type: ManualMovement): boolean {
  return type === "ADJUSTMENT" || type === "WRITE_OFF";
}

type Messages = Dictionary["stock"]["errors"];

export type MovementValues = {
  type: string;
  productId: string;
  warehouseId: string;
  toWarehouseId: string;
  quantity: string;
  comment: string;
};

export type MovementFormState = {
  errors?: Partial<Record<keyof MovementValues | "form", string[]>>;
  values?: MovementValues;
};

export type MovementInput = {
  type: ManualMovement;
  productId: string;
  warehouseId: string;
  toWarehouseId: string | null;
  /** Cantidad positiva; en un ajuste, lo contado (puede ser 0). */
  quantity: string;
  comment: string | null;
};

export function validateMovementForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: MovementInput; values: MovementValues }
  | { ok: false; state: MovementFormState } {
  const get = (key: keyof MovementValues) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const values: MovementValues = {
    type: get("type"),
    productId: get("productId"),
    warehouseId: get("warehouseId"),
    toWarehouseId: get("toWarehouseId"),
    quantity: get("quantity"),
    comment: get("comment"),
  };

  const schema = z
    .object({
      type: z.enum(MANUAL_MOVEMENTS, { message: t.typeRequired }),
      productId: z.string().refine(isCuid, t.productRequired),
      warehouseId: z.string().refine(isCuid, t.warehouseRequired),
      toWarehouseId: z.string(),
      quantity: z.string(),
      comment: z
        .string()
        .trim()
        .max(STOCK_COMMENT_MAX_LENGTH, t.commentTooLong),
    })
    .transform((data, ctx) => {
      const quantity = parseDecimalInput(data.quantity, QUANTITY_LIMITS);
      // En un ajuste se carga lo contado, que puede ser 0; el resto mueve al
      // menos una milésima.
      const minimumMilli = BigInt(data.type === "ADJUSTMENT" ? 0 : 1);
      if (quantity === null || toMilli(quantity) < minimumMilli) {
        ctx.addIssue({
          code: "custom",
          path: ["quantity"],
          message:
            data.type === "ADJUSTMENT" ? t.countedInvalid : t.quantityInvalid,
        });
      }
      const isTransfer = data.type === "TRANSFER";
      if (isTransfer && !isCuid(data.toWarehouseId)) {
        ctx.addIssue({
          code: "custom",
          path: ["toWarehouseId"],
          message: t.toWarehouseRequired,
        });
      } else if (isTransfer && data.toWarehouseId === data.warehouseId) {
        ctx.addIssue({
          code: "custom",
          path: ["toWarehouseId"],
          message: t.sameWarehouse,
        });
      }
      if (commentRequired(data.type) && data.comment === "") {
        ctx.addIssue({
          code: "custom",
          path: ["comment"],
          message: t.commentRequired,
        });
      }
      return {
        type: data.type,
        productId: data.productId,
        warehouseId: data.warehouseId,
        toWarehouseId: isTransfer ? data.toWarehouseId : null,
        quantity: quantity ?? "0",
        comment: data.comment || null,
      };
    });

  const parsed = schema.safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data, values };
  return {
    ok: false,
    state: { errors: z.flattenError(parsed.error).fieldErrors, values },
  };
}

export type MovementLeg = {
  warehouseId: string;
  type: "ENTRY" | "ADJUSTMENT" | "WRITE_OFF" | "TRANSFER_OUT" | "TRANSFER_IN";
  /** Variación con signo. */
  quantity: string;
  balanceAfter: string;
};

/**
 * Las patas a registrar, a partir de los saldos actuales (ya bloqueados).
 * null si un ajuste no cambia nada (lo contado coincide con el saldo).
 */
export function planMovement(
  input: MovementInput,
  balances: { from: string; to?: string },
): MovementLeg[] | null {
  const from = toMilli(balances.from);
  const amount = toMilli(input.quantity);
  const leg = (
    warehouseId: string,
    type: MovementLeg["type"],
    before: bigint,
    delta: bigint,
  ): MovementLeg => ({
    warehouseId,
    type,
    quantity: fromMilli(delta),
    balanceAfter: fromMilli(before + delta),
  });

  switch (input.type) {
    case "ENTRY":
      return [leg(input.warehouseId, "ENTRY", from, amount)];
    case "WRITE_OFF":
      return [leg(input.warehouseId, "WRITE_OFF", from, -amount)];
    case "ADJUSTMENT": {
      const delta = amount - from;
      return delta === BigInt(0)
        ? null
        : [leg(input.warehouseId, "ADJUSTMENT", from, delta)];
    }
    case "TRANSFER":
      return [
        leg(input.warehouseId, "TRANSFER_OUT", from, -amount),
        leg(
          input.toWarehouseId!,
          "TRANSFER_IN",
          toMilli(balances.to ?? "0"),
          amount,
        ),
      ];
  }
}
