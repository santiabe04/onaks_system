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

// Payments and refunds of the customer account. Same permission as managing
// orders: the admin who delivers is the one who collects.
const PERMISSION = "sales:manage";
const ENTITY = "CUSTOMER_PAYMENT";

/** Aborts the transaction with a message for the form. */
class AccountError extends Error {}

function revalidateAccount() {
  // Account, order detail, lists (payment status) and "My orders".
  revalidatePath("/[lang]", "layout");
}

/**
 * Records a payment or refund from the customer and recalculates the payment status
 * of their orders. `saleId` is the order it was entered from (reference).
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
        // Only what the customer has in credit is returned.
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

/** Voids a badly entered payment or refund (it stays in the history and stops counting). */
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

      // Re-read with the account locked: two voids at once do not pass.
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
