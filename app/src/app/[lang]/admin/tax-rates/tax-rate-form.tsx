"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  TAX_RATE_NAME_MAX_LENGTH,
  type TaxRateFormState,
  type TaxRateValues,
} from "@/lib/tax-rate";

type Props = {
  action: (
    state: TaxRateFormState,
    formData: FormData,
  ) => Promise<TaxRateFormState>;
  defaultValues: TaxRateValues;
  submitLabel: string;
  t: Dictionary["taxRates"];
  common: Dictionary["common"];
};

export function TaxRateForm({
  action,
  defaultValues,
  submitLabel,
  t,
  common,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  // Si hubo error, se muestra lo último que cargó el usuario.
  const values = state.values ?? defaultValues;

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field label={t.name} error={state.errors?.name}>
        <Input
          name="name"
          defaultValue={values.name}
          required
          maxLength={TAX_RATE_NAME_MAX_LENGTH}
          placeholder={t.namePlaceholder}
        />
      </Field>

      <Field label={t.percent} error={state.errors?.percent}>
        <div className="flex items-center gap-2">
          {/* Texto y no number: acepta coma decimal y el server valida. */}
          <Input
            name="percent"
            defaultValue={values.percent}
            required
            inputMode="decimal"
            placeholder="21"
            className="w-28"
          />
          <span>%</span>
        </div>
        <span className="text-xs opacity-60">{t.percentHint}</span>
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input
          key={String(values.isActive)}
          type="checkbox"
          name="isActive"
          defaultChecked={values.isActive}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">{t.isActive}</span>
          <span className="block text-xs opacity-60">{t.isActiveHint}</span>
        </span>
      </label>

      <FormError messages={state.errors?.form} />

      <div className="flex gap-3">
        <SubmitButton pending={pending} pendingLabel={common.saving}>
          {submitLabel}
        </SubmitButton>
        <Link href="/admin/tax-rates" className={buttonClass("secondary")}>
          {common.cancel}
        </Link>
      </div>
    </form>
  );
}
