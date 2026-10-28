"use client";

import { useActionState, useState } from "react";
import {
  registerPayment,
  voidPayment,
} from "@/app/[lang]/admin/customers/[id]/account/actions";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  PAYMENT_NOTES_MAX_LENGTH,
  type PaymentFormState,
} from "@/lib/payment-form";

const CONTROL = "rounded border border-current/20 bg-transparent px-3 py-2";

/** Cobro (o reintegro, si hay saldo a favor) de la cuenta corriente. */
export function PaymentForm({
  customerId,
  saleId = null,
  suggestedAmount,
  maxRefund,
  today,
  t,
  methods,
}: {
  customerId: string;
  /** Pedido desde el que se carga (referencia). */
  saleId?: string | null;
  /** Monto precargado ("30000,5"), p. ej. lo que falta del pedido. */
  suggestedAmount?: string;
  /** Saldo a favor formateado; sin él no se ofrece reintegro. */
  maxRefund?: string;
  /** YYYY-MM-DD de Argentina, para precargar la fecha. */
  today: string;
  t: Dictionary["account"];
  methods: Dictionary["orders"]["paymentMethods"];
}) {
  const [state, action, pending] = useActionState<PaymentFormState, FormData>(
    registerPayment.bind(null, customerId, saleId),
    {},
  );
  const values = state.values;
  // Solo para el aviso del reintegro.
  const [kind, setKind] = useState(values?.kind ?? "PAYMENT");
  // Sin saldo a favor no hay reintegro, aunque antes se haya elegido.
  const refund = Boolean(maxRefund) && kind === "REFUND";

  return (
    // key: después de guardar, el form vuelve a los valores iniciales.
    <form
      key={state.savedAt ?? 0}
      action={action}
      className="flex flex-col gap-3 text-sm"
    >
      {maxRefund && (
        <fieldset className="flex gap-4">
          <legend className="mb-1 font-medium">{t.kind}</legend>
          {(["PAYMENT", "REFUND"] as const).map((option) => (
            <label key={option} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="kind"
                value={option}
                defaultChecked={(values?.kind ?? "PAYMENT") === option}
                onChange={() => setKind(option)}
              />
              {t.kinds[option]}
            </label>
          ))}
        </fieldset>
      )}
      {refund && maxRefund && (
        <p className="opacity-70">
          {interpolate(t.refundHint, { max: maxRefund })}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t.amount} error={state.errors?.amount}>
          <Input
            name="amount"
            inputMode="decimal"
            required
            defaultValue={values?.amount ?? suggestedAmount ?? ""}
          />
        </Field>
        <Field label={t.method} error={state.errors?.method}>
          <select
            name="method"
            required
            defaultValue={values?.method ?? "CASH"}
            className={CONTROL}
          >
            {(Object.keys(methods) as PaymentMethod[]).map((method) => (
              <option key={method} value={method}>
                {methods[method]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.paidOn} error={state.errors?.paidOn}>
          <Input
            type="date"
            name="paidOn"
            required
            max={today}
            defaultValue={values?.paidOn ?? today}
          />
        </Field>
      </div>
      <Field label={t.notes} error={state.errors?.notes}>
        <Input
          name="notes"
          maxLength={PAYMENT_NOTES_MAX_LENGTH}
          defaultValue={values?.notes ?? ""}
        />
      </Field>

      <FormError messages={state.errors?.form} />
      {state.savedAt && (
        <p role="status" className="text-green-700 dark:text-green-400">
          ✓ {t.saved}
        </p>
      )}
      <div>
        <SubmitButton pending={pending} pendingLabel={t.saving}>
          {refund ? t.registerRefund : t.register}
        </SubmitButton>
      </div>
    </form>
  );
}

/** "Anular" con motivo obligatorio, plegado hasta que se lo pide. */
export function VoidPaymentForm({
  paymentId,
  t,
}: {
  paymentId: string;
  t: Dictionary["account"];
}) {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(
    voidPayment.bind(null, paymentId),
    {},
  );
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-red-600 hover:underline">
        {t.void}
      </summary>
      <form action={action} className="mt-2 flex flex-col gap-2">
        <input
          name="reason"
          required
          maxLength={PAYMENT_NOTES_MAX_LENGTH}
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
