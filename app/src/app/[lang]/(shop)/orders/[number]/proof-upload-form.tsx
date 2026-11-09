"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { uploadTransferProof, type OrderActionState } from "../actions";

/** El cliente adjunta el comprobante de la transferencia de su pedido. */
export function ProofUploadForm({
  saleId,
  t,
}: {
  saleId: string;
  t: Dictionary["transfer"];
}) {
  const [state, action, pending] = useActionState<OrderActionState, FormData>(
    uploadTransferProof.bind(null, saleId),
    {},
  );
  return (
    <form action={action} className="mt-3 flex flex-col gap-2 text-sm">
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t.proofFile}</span>
        <input
          type="file"
          name="proof"
          accept="image/*,application/pdf"
          required
        />
      </label>
      <FormError messages={state.error} />
      <div>
        <SubmitButton pending={pending} pendingLabel={t.proofSending}>
          {t.proofSend}
        </SubmitButton>
      </div>
    </form>
  );
}
