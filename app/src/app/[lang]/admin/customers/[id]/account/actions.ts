"use server";

import { revalidatePath } from "next/cache";
import { getActionDictionary } from "@/i18n/dictionary";
import { appLocale, interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { maxRefund, toCents } from "@/lib/account";
import {
  createCustomerPayment,
  lockAccount,
  recomputeAccount,
} from "@/lib/account-ledger";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import {
  validatePaymentForm,
  validateVoidReason,
  type PaymentFormState,
} from "@/lib/payment-form";

// Cobros y reintegros de la cuenta corriente. Mismo permiso que gestionar
// pedidos: el admin que entrega es el que cobra.
const PERMISSION = "sales:manage";
const ENTITY = "CUSTOMER_PAYMENT";

/** Corta la transacción con un mensaje para el form. */
class AccountError extends Error {}

function revalidateAccount() {
  // Cuenta, detalle de pedidos, listas (estado de pago) y "Mis pedidos".
  revalidatePath("/[lang]", "layout");
}

/**
 * Registra un cobro o un reintegro del cliente y recalcula el estado de pago
 * de sus pedidos. `saleId` es el pedido desde el que se cargó (referencia).
 */
export async function registerPayment(
  customerId: string,
  saleId: string | null,
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const user = await requirePermission(PERMISSION);
  const t = getActionDictionary().account.errors;

  if (!isCuid(customerId) || (saleId !== null && !isCuid(saleId))) {
    return { errors: { form: [t.notFound] } };
  }
  const result = validatePaymentForm(formData, t);
  if (!result.ok) return result.state;
  const input = result.data;

  try {
    await db.$transaction(async (tx) => {
      if (!(await lockAccount(tx, customerId))) {
        throw new AccountError(t.notFound);
      }
      if (input.kind === "REFUND") {
        // Solo se devuelve lo que el cliente tiene a favor.
        const { summary } = await recomputeAccount(tx, customerId);
        const max = maxRefund(summary.balance);
        if (toCents(input.amount) > toCents(max)) {
          throw new AccountError(
            interpolate(t.refundTooHigh, {
              max: formatters(appLocale()).money(max),
            }),
          );
        }
      }
      await createCustomerPayment(
        tx,
        { customerId, saleId, ...input },
        user.id,
      );
    });
  } catch (error) {
    if (error instanceof AccountError) {
      return { errors: { form: [error.message] }, values: result.values };
    }
    throw error;
  }

  revalidateAccount();
  return { savedAt: Date.now() };
}

/** Anula un cobro o reintegro mal cargado (queda en el historial, deja de sumar). */
export async function voidPayment(
  paymentId: string,
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requirePermission(PERMISSION);
  const t = getActionDictionary().account.errors;

  if (!isCuid(paymentId)) return { error: t.notFound };
  const reason = validateVoidReason(formData, t);
  if (!reason.ok) return { error: reason.error };

  try {
    await db.$transaction(async (tx) => {
      const current = await tx.customerPayment.findUnique({
        where: { id: paymentId },
        select: { customerId: true },
      });
      if (!current) throw new AccountError(t.notFound);
      await lockAccount(tx, current.customerId);

      // Releída con la cuenta bloqueada: dos anulaciones a la vez no pasan.
      const before = await tx.customerPayment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      if (before.voidedAt) throw new AccountError(t.alreadyVoided);
      const after = await tx.customerPayment.update({
        where: { id: paymentId },
        data: {
          voidedAt: new Date(),
          voidedById: user.id,
          voidReason: reason.reason,
        },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: paymentId,
        before,
        after,
      });
      await recomputeAccount(tx, current.customerId);
    });
  } catch (error) {
    if (error instanceof AccountError) return { error: error.message };
    throw error;
  }

  revalidateAccount();
  return {};
}
