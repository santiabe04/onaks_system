import { z } from "zod";
import type { SaleState, SalePaymentState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { isValidCuit, normalizeCuit } from "./cuit";

// Puro: datos de cobro por transferencia y reglas de los comprobantes que
// sube el cliente. El archivo en sí se procesa en `lib/transfer-proof-files`.

export const TRANSFER_LIMITS = {
  bankName: 60,
  holder: 80,
  /** Motivo con el que el admin rechaza un comprobante. */
  rejectReason: 200,
} as const;

// Pesos de los dos dígitos verificadores del CBU (BCRA).
const CBU_BLOCK_1 = [7, 1, 3, 9, 7, 1, 3];
const CBU_BLOCK_2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];

function checkDigit(digits: number[], weights: number[]): number {
  const sum = digits.reduce((acc, digit, i) => acc + digit * weights[i], 0);
  return (10 - (sum % 10)) % 10;
}

/** "0170 0992-2000…" → solo los dígitos. */
export function normalizeCbu(input: string): string {
  return input.replace(/[\s-]/g, "");
}

/** 22 dígitos con los dos verificadores correctos (banco/sucursal y cuenta). */
export function isValidCbu(input: string): boolean {
  const cbu = normalizeCbu(input);
  if (!/^\d{22}$/.test(cbu)) return false;
  const digits = [...cbu].map(Number);
  return (
    checkDigit(digits.slice(0, 7), CBU_BLOCK_1) === digits[7] &&
    checkDigit(digits.slice(8, 21), CBU_BLOCK_2) === digits[21]
  );
}

/** Alias bancario: 6 a 20 caracteres entre letras, números, punto y guion. */
export function isValidAlias(input: string): boolean {
  return /^[A-Za-z0-9.-]{6,20}$/.test(input);
}

type Messages = Dictionary["paymentSettings"]["errors"];

export type TransferSettingsValues = {
  bankName: string;
  holder: string;
  cuit: string;
  cbu: string;
  alias: string;
};

export type TransferSettingsInput = {
  bankName: string;
  holder: string;
  /** Sin guiones. */
  cuit: string;
  cbu: string | null;
  alias: string | null;
};

export type TransferSettingsFormState = {
  errors?: Partial<Record<keyof TransferSettingsValues | "form", string[]>>;
  values?: TransferSettingsValues;
  savedAt?: number;
};

function read(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Los datos de cobro: banco, titular, CUIT y al menos CBU o alias. */
export function validateTransferSettingsForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: TransferSettingsInput; values: TransferSettingsValues }
  | { ok: false; state: TransferSettingsFormState } {
  const values: TransferSettingsValues = {
    bankName: read(formData, "bankName"),
    holder: read(formData, "holder"),
    cuit: read(formData, "cuit"),
    cbu: read(formData, "cbu"),
    alias: read(formData, "alias"),
  };
  const schema = z
    .object({
      bankName: z
        .string()
        .min(1, t.bankNameRequired)
        .max(
          TRANSFER_LIMITS.bankName,
          interpolate(t.tooLong, { max: TRANSFER_LIMITS.bankName }),
        ),
      holder: z
        .string()
        .min(1, t.holderRequired)
        .max(
          TRANSFER_LIMITS.holder,
          interpolate(t.tooLong, { max: TRANSFER_LIMITS.holder }),
        ),
      cuit: z
        .string()
        .transform(normalizeCuit)
        .refine(isValidCuit, t.cuitInvalid),
      cbu: z
        .string()
        .transform(normalizeCbu)
        .refine((cbu) => cbu === "" || isValidCbu(cbu), t.cbuInvalid)
        .transform((cbu) => cbu || null),
      alias: z
        .string()
        .refine((alias) => alias === "" || isValidAlias(alias), t.aliasInvalid)
        .transform((alias) => alias || null),
    })
    .refine((data) => data.cbu !== null || data.alias !== null, {
      message: t.cbuOrAlias,
      path: ["cbu"],
    });
  const parsed = schema.safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data, values };
  return {
    ok: false,
    state: { errors: z.flattenError(parsed.error).fieldErrors, values },
  };
}

/** La transferencia solo se ofrece con datos de cobro cargados (con CBU o alias). */
export function transferAvailable(
  settings: { cbu: string | null; alias: string | null } | null,
): boolean {
  return (
    settings !== null && (settings.cbu !== null || settings.alias !== null)
  );
}

/**
 * Un cliente puede subir un comprobante de un pedido que paga por
 * transferencia, no cancelado ni pagado del todo, mientras no haya otro
 * esperando revisión (el admin revisa de a uno).
 */
export function canUploadProof(
  sale: {
    paymentMethod: string;
    state: SaleState;
    paymentState: SalePaymentState;
  },
  proofs: { state: string }[],
): boolean {
  return (
    sale.paymentMethod === "TRANSFER" &&
    sale.state !== "CANCELED" &&
    sale.paymentState !== "PAID" &&
    !proofs.some((proof) => proof.state === "PENDING")
  );
}

/** Motivo del rechazo: obligatorio y acotado. */
export function validateRejectReason(
  formData: FormData,
  t: { reasonRequired: string; reasonTooLong: string },
): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = read(formData, "reason");
  if (!reason) return { ok: false, error: t.reasonRequired };
  if (reason.length > TRANSFER_LIMITS.rejectReason) {
    return { ok: false, error: t.reasonTooLong };
  }
  return { ok: true, reason };
}
