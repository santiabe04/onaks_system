"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { NOTES_MAX_LENGTH, type CheckoutFormState } from "@/lib/checkout";
import { placeOrder } from "./actions";

export type AddressOption = { id: string; name: string; detail: string };

export function CheckoutForm({
  addresses,
  fingerprint,
  t,
}: {
  addresses: AddressOption[];
  /** Huella del carrito que se está mostrando (ver `cartFingerprint`). */
  fingerprint: string;
  t: Dictionary["checkout"];
}) {
  const [state, action, pending] = useActionState<CheckoutFormState, FormData>(
    placeOrder,
    {},
  );
  // Con una sola dirección va preseleccionada; con varias, que elija.
  const values = state.values ?? {
    addressId: addresses.length === 1 ? addresses[0].id : "",
    notes: "",
  };

  return (
    // key: React 19 resetea el form después de la action; así vuelve a lo elegido.
    <form
      key={JSON.stringify(state)}
      action={action}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="fingerprint" value={fingerprint} />

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-medium">{t.address}</legend>
        {addresses.map((address) => (
          <label
            key={address.id}
            className="flex items-start gap-2 rounded border border-current/20 p-3 has-checked:border-current"
          >
            <input
              type="radio"
              name="addressId"
              value={address.id}
              defaultChecked={values.addressId === address.id}
              required
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{address.name}</span>
              <span className="block text-xs opacity-70">{address.detail}</span>
            </span>
          </label>
        ))}
        {state.errors?.addressId && (
          <span className="text-red-600">
            {state.errors.addressId.join(". ")}
          </span>
        )}
      </fieldset>

      <Field label={t.notesOptional} error={state.errors?.notes}>
        <textarea
          name="notes"
          defaultValue={values.notes}
          maxLength={NOTES_MAX_LENGTH}
          rows={3}
          placeholder={t.notesPlaceholder}
          className="rounded border border-current/20 bg-transparent px-3 py-2"
        />
      </Field>

      <p className="text-sm">
        <span className="font-medium">{t.paymentMethod}:</span> {t.cash}
      </p>

      <FormError messages={state.errors?.form} />

      <div>
        <SubmitButton pending={pending} pendingLabel={t.confirming}>
          {t.confirm}
        </SubmitButton>
      </div>
    </form>
  );
}
