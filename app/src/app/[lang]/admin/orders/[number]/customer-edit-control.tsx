"use client";

import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { StateChangeFormState } from "@/lib/sale-state-form";
import { setCustomerCanEdit } from "../actions";

/** Enables / disables the customer's ability to edit a Pending order. */
export function CustomerEditControl({
  saleId,
  allowed,
  editingBy,
  t,
}: {
  saleId: string;
  allowed: boolean;
  /** Name of whoever is editing it, if someone is. */
  editingBy: string | null;
  t: Dictionary["adminOrders"]["customerEdit"];
}) {
  const [state, action, pending] = useActionState<StateChangeFormState>(
    setCustomerCanEdit.bind(null, saleId, !allowed),
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-2 text-sm">
      <p className="opacity-70">{t.hint}</p>
      {allowed && <p>{t.allowed}</p>}
      {editingBy && (
        <p className="font-medium">
          {interpolate(t.editing, { name: editingBy })}
        </p>
      )}
      <div>
        <button
          type="submit"
          disabled={pending}
          className={buttonClass(allowed ? "secondary" : "primary")}
        >
          {pending ? t.saving : allowed ? t.revoke : t.allow}
        </button>
      </div>
      <FormError messages={state.error} />
    </form>
  );
}
