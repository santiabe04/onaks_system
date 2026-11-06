"use client";

import { useActionState } from "react";
import {
  registerAdjustment,
  voidCustomerCreditNote,
  type CreditNoteFormState,
} from "@/app/[lang]/admin/customers/[id]/account/credit-note-actions";
import { FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { CREDIT_NOTE_REASON_MAX_LENGTH } from "@/lib/customer-credit";

const CONTROL = "rounded border border-current/20 bg-transparent px-3 py-2";

/** Nota de crédito por importe (bonificación o ajuste), sin mercadería. */
export function AdjustmentForm({
  customerId,
  t,
}: {
  customerId: string;
  t: Dictionary["customerCreditNotes"];
}) {
  const [state, action, pending] = useActionState<
    CreditNoteFormState,
    FormData
  >(registerAdjustment.bind(null, customerId), {});

  return (
    // key: después de guardar, el form vuelve vacío.
    <form
      key={state.savedAt ?? 0}
      action={action}
      className="flex flex-col gap-3 text-sm"
    >
      <p className="text-xs opacity-70">{t.adjustmentHint}</p>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t.amount}</span>
          <Input name="amount" required inputMode="decimal" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t.reason}</span>
          <input
            name="reason"
            required
            maxLength={CREDIT_NOTE_REASON_MAX_LENGTH}
            placeholder={t.reasonPlaceholder}
            className={CONTROL}
          />
        </label>
      </div>
      <FormError messages={state.error} />
      <div>
        <SubmitButton pending={pending} pendingLabel={t.creating}>
          {t.createAdjustment}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Anular una nota de crédito con motivo (queda en el historial). */
export function VoidCreditNoteForm({
  noteId,
  t,
}: {
  noteId: string;
  t: Dictionary["customerCreditNotes"];
}) {
  const [state, action, pending] = useActionState<
    CreditNoteFormState,
    FormData
  >(voidCustomerCreditNote.bind(null, noteId), {});

  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-red-600 hover:underline">
        {t.void}
      </summary>
      <form action={action} className="mt-2 flex flex-col gap-2">
        <p className="opacity-70">{t.voidHint}</p>
        <input
          name="reason"
          required
          maxLength={200}
          placeholder={t.voidReason}
          aria-label={t.voidReason}
          className={CONTROL}
        />
        <FormError messages={state.error} />
        <button
          type="submit"
          disabled={pending}
          className="self-start text-red-600 hover:underline disabled:opacity-50"
        >
          {pending ? t.voiding : t.voidSubmit}
        </button>
      </form>
    </details>
  );
}
