"use server";

import { revalidatePath } from "next/cache";
import { getActionDictionary } from "@/i18n/dictionary";
import { createCustomerPayment, lockAccount } from "@/lib/account-ledger";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { validatePaymentForm } from "@/lib/payment-form";
import { validateRejectReason } from "@/lib/transfer";

// Transfer receipt review: validating records the payment in
// the customer account; rejecting leaves the reason so the customer can upload another one.
// Same permission as collecting and changing statuses.
const PERMISSION = "sales:manage";

export type ProofReviewState = { error?: string };

/** Aborts the transaction with a message for the admin. */
class ProofError extends Error {}

/**
 * Validates the receipt: creates the transfer payment (amount and date that
 * the admin confirms) allocated to the order and marks the receipt as validated.
 * Lock order: the customer account, then the receipt.
 */
export async function validateTransferProof(
  proofId: string,
  _prev: ProofReviewState,
  formData: FormData,
): Promise<ProofReviewState> {
  const user = await requirePermission(PERMISSION);
  const dictionary = getActionDictionary();
  const t = dictionary.transfer.errors;
  if (!isCuid(proofId)) return { error: t.notFound };

  // Always a transfer payment: only the amount and the date come from the form.
  const paymentForm = new FormData();
  paymentForm.set("kind", "PAYMENT");
  paymentForm.set("method", "TRANSFER");
  paymentForm.set("notes", dictionary.transfer.paymentNote);
  for (const key of ["amount", "paidOn"]) {
    const value = formData.get(key);
    if (typeof value === "string") paymentForm.set(key, value);
  }
  const payment = validatePaymentForm(paymentForm, dictionary.account.errors);
  if (!payment.ok) {
    return {
      error: Object.values(payment.state.errors ?? {})
        .flat()
        .join(". "),
    };
  }

  try {
    await db.$transaction(async (tx) => {
      const found = await tx.transferProof.findUnique({
        where: { id: proofId },
        select: {
          saleId: true,
          sale: { select: { address: { select: { customerId: true } } } },
        },
      });
      if (!found) throw new ProofError(t.notFound);
      const customerId = found.sale.address.customerId;
      await lockAccount(tx, customerId);
      // Re-read with the account locked: two validations at once do not both pass.
      const [locked] = await tx.$queryRaw<{ state: string }[]>`
        SELECT "state"::text AS "state" FROM "transfer_proofs"
        WHERE "id" = ${proofId} FOR UPDATE`;
      if (!locked || locked.state !== "PENDING") {
        throw new ProofError(t.alreadyReviewed);
      }
      const created = await createCustomerPayment(
        tx,
        { customerId, saleId: found.saleId, ...payment.data },
        user.id,
      );
      await tx.transferProof.update({
        where: { id: proofId },
        data: {
          state: "VALIDATED",
          reviewedAt: new Date(),
          reviewedById: user.id,
          paymentId: created.id,
        },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "TRANSFER_PROOF",
        entityId: proofId,
        before: { state: "PENDING" },
        after: { state: "VALIDATED", paymentId: created.id },
      });
    });
  } catch (error) {
    if (error instanceof ProofError) return { error: error.message };
    throw error;
  }

  // Order detail, customer account, debtors and the dashboard notice.
  revalidatePath("/[lang]", "layout");
  return {};
}

/** Rejects the receipt with a reason: the customer sees it and can upload another one. */
export async function rejectTransferProof(
  proofId: string,
  _prev: ProofReviewState,
  formData: FormData,
): Promise<ProofReviewState> {
  const user = await requirePermission(PERMISSION);
  const t = getActionDictionary().transfer.errors;
  if (!isCuid(proofId)) return { error: t.notFound };

  const reason = validateRejectReason(formData, t);
  if (!reason.ok) return { error: reason.error };

  try {
    await db.$transaction(async (tx) => {
      // Does not touch the account: it is enough to lock the receipt.
      const [locked] = await tx.$queryRaw<{ state: string }[]>`
        SELECT "state"::text AS "state" FROM "transfer_proofs"
        WHERE "id" = ${proofId} FOR UPDATE`;
      if (!locked) throw new ProofError(t.notFound);
      if (locked.state !== "PENDING") throw new ProofError(t.alreadyReviewed);
      await tx.transferProof.update({
        where: { id: proofId },
        data: {
          state: "REJECTED",
          reviewedAt: new Date(),
          reviewedById: user.id,
          rejectReason: reason.reason,
        },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "TRANSFER_PROOF",
        entityId: proofId,
        before: { state: "PENDING" },
        after: { state: "REJECTED", rejectReason: reason.reason },
      });
    });
  } catch (error) {
    if (error instanceof ProofError) return { error: error.message };
    throw error;
  }

  revalidatePath("/[lang]", "layout");
  return {};
}
