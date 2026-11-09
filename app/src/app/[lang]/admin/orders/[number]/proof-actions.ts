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

// Revisión de los comprobantes de transferencia: validar asienta el cobro en
// la cuenta corriente; rechazar deja el motivo para que el cliente suba otro.
// Mismo permiso que cobrar y cambiar estados.
const PERMISSION = "sales:manage";

export type ProofReviewState = { error?: string };

/** Corta la transacción con un mensaje para el admin. */
class ProofError extends Error {}

/**
 * Valida el comprobante: crea el cobro por transferencia (monto y fecha que
 * confirma el admin) imputado al pedido y marca el comprobante como validado.
 * Orden de bloqueo: cuenta del cliente y después el comprobante.
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

  // Siempre un cobro por transferencia: solo el monto y la fecha vienen del form.
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
      // Releído con la cuenta bloqueada: dos validaciones a la vez no pasan.
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

  // Detalle del pedido, cuenta corriente, deudores y aviso del dashboard.
  revalidatePath("/[lang]", "layout");
  return {};
}

/** Rechaza el comprobante con motivo: el cliente lo ve y puede subir otro. */
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
      // No toca la cuenta: alcanza con bloquear el comprobante.
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
