"use client";

import { useActionState, useState } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { NOTES_MAX_LENGTH, type CheckoutFormState } from "@/lib/checkout";
import { placeOrder } from "./actions";

export type AddressOption = { id: string; name: string; detail: string };

/** Los datos de cobro que se muestran al elegir transferencia. */
export type TransferDetails = {
  bankName: string;
  holder: string;
  cuit: string;
  cbu: string | null;
  alias: string | null;
};

export function CheckoutForm({
  addresses,
  fingerprint,
  defaultAddressId,
  transfer,
  t,
  tTransfer,
}: {
  addresses: AddressOption[];
  /** Huella del carrito que se está mostrando (ver `cartFingerprint`). */
  fingerprint: string;
  /** Al modificar un pedido, su dirección. */
  defaultAddressId?: string;
  /** Datos de cobro; sin ellos solo se ofrece efectivo. */
  transfer: TransferDetails | null;
  t: Dictionary["checkout"];
  tTransfer: Dictionary["transfer"];
}) {
  const [state, action, pending] = useActionState<CheckoutFormState, FormData>(
    placeOrder,
    {},
  );
  // Con una sola dirección va preseleccionada; con varias, que elija.
  const values = state.values ?? {
    addressId:
      addresses.find((address) => address.id === defaultAddressId)?.id ??
      (addresses.length === 1 ? addresses[0].id : ""),
    notes: "",
    paymentMethod: "CASH",
  };
  // Transferencia solo si hay datos de cobro (o si ya venía elegida).
  const [method, setMethod] = useState(
    transfer && values.paymentMethod === "TRANSFER" ? "TRANSFER" : "CASH",
  );

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

      {transfer ? (
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 font-medium">{t.paymentMethod}</legend>
          {(["CASH", "TRANSFER"] as const).map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 rounded border border-current/20 p-3 has-checked:border-current"
            >
              <input
                type="radio"
                name="paymentMethod"
                value={option}
                checked={method === option}
                onChange={() => setMethod(option)}
              />
              {option === "CASH" ? tTransfer.cash : tTransfer.transfer}
            </label>
          ))}
          {state.errors?.paymentMethod && (
            <span className="text-red-600">
              {state.errors.paymentMethod.join(". ")}
            </span>
          )}
        </fieldset>
      ) : (
        <p className="text-sm">
          <span className="font-medium">{t.paymentMethod}:</span> {t.cash}
        </p>
      )}

      {transfer && method === "TRANSFER" && (
        <section className="flex flex-col gap-3 rounded border border-current/20 p-3 text-sm">
          <p className="opacity-80">{tTransfer.checkoutHint}</p>
          <h3 className="font-medium">{tTransfer.bankDetails}</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="opacity-70">{tTransfer.bank}</dt>
            <dd>{transfer.bankName}</dd>
            <dt className="opacity-70">{tTransfer.holder}</dt>
            <dd>{transfer.holder}</dd>
            <dt className="opacity-70">{tTransfer.cuit}</dt>
            <dd className="font-mono">{transfer.cuit}</dd>
            {transfer.cbu && (
              <>
                <dt className="opacity-70">{tTransfer.cbu}</dt>
                <dd className="font-mono break-all">{transfer.cbu}</dd>
              </>
            )}
            {transfer.alias && (
              <>
                <dt className="opacity-70">{tTransfer.alias}</dt>
                <dd className="font-mono">{transfer.alias}</dd>
              </>
            )}
          </dl>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{tTransfer.proofOptional}</span>
            <input
              type="file"
              name="proof"
              accept="image/*,application/pdf"
              className="text-sm"
            />
          </label>
        </section>
      )}

      <FormError messages={state.errors?.form} />

      <div>
        <SubmitButton pending={pending} pendingLabel={t.confirming}>
          {t.confirm}
        </SubmitButton>
      </div>
    </form>
  );
}
