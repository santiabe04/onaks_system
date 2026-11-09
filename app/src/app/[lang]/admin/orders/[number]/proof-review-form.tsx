"use client";

import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { TRANSFER_LIMITS } from "@/lib/transfer";
import {
  rejectTransferProof,
  validateTransferProof,
  type ProofReviewState,
} from "./proof-actions";

/** Validar (asienta el cobro) o rechazar (con motivo) un comprobante en revisión. */
export function ProofReviewForm({
  proofId,
  suggestedAmount,
  today,
  t,
}: {
  proofId: string;
  /** Lo que falta cobrar del pedido, ya formateado para el input. */
  suggestedAmount: string;
  today: string;
  t: Dictionary["transfer"];
}) {
  const [validateState, validate, validating] = useActionState<
    ProofReviewState,
    FormData
  >(validateTransferProof.bind(null, proofId), {});
  const [rejectState, reject, rejecting] = useActionState<
    ProofReviewState,
    FormData
  >(rejectTransferProof.bind(null, proofId), {});

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form action={validate} className="flex flex-col gap-2">
        <Field label={t.amount}>
          <Input
            name="amount"
            inputMode="decimal"
            defaultValue={suggestedAmount}
            required
          />
        </Field>
        <Field label={t.paidOn}>
          <Input type="date" name="paidOn" defaultValue={today} required />
        </Field>
        <FormError messages={validateState.error} />
        <div>
          <SubmitButton pending={validating} pendingLabel={t.validating}>
            {t.validate}
          </SubmitButton>
        </div>
      </form>
      <form action={reject} className="flex flex-col gap-2">
        <Field label={t.rejectReason}>
          <Input
            name="reason"
            maxLength={TRANSFER_LIMITS.rejectReason}
            required
          />
        </Field>
        <p className="text-xs opacity-70">{t.rejectHint}</p>
        <FormError messages={rejectState.error} />
        <div>
          <button
            type="submit"
            disabled={rejecting}
            className={buttonClass("secondary")}
          >
            {rejecting ? t.rejecting : t.rejectSubmit}
          </button>
        </div>
      </form>
    </div>
  );
}
