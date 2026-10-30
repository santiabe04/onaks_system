"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { CREDIT_RELEASE_NOTE_MAX_LENGTH } from "@/lib/credit";
import type { StateChangeFormState } from "@/lib/sale-state-form";
import { releaseCreditHold } from "../actions";

/** Aprobar un pedido retenido por crédito, con un comentario opcional. */
export function CreditHoldControl({
  saleId,
  t,
}: {
  saleId: string;
  t: Dictionary["adminOrders"]["creditHold"];
}) {
  const [state, action, pending] = useActionState<
    StateChangeFormState,
    FormData
  >(releaseCreditHold.bind(null, saleId), {});

  return (
    <form action={action} className="mt-3 flex flex-col gap-2 text-sm">
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t.note}</span>
        <textarea
          name="note"
          rows={2}
          maxLength={CREDIT_RELEASE_NOTE_MAX_LENGTH}
          placeholder={t.notePlaceholder}
          className="rounded border border-current/20 bg-transparent px-3 py-2"
        />
      </label>
      <div>
        <SubmitButton pending={pending} pendingLabel={t.approving}>
          {t.approve}
        </SubmitButton>
      </div>
      <FormError messages={state.error} />
    </form>
  );
}
