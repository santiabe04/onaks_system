"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  PRICE_LIST_NAME_MAX_LENGTH,
  type PriceListFormState,
  type PriceListValues,
} from "@/lib/price-list";

type Props = {
  action: (
    state: PriceListFormState,
    formData: FormData,
  ) => Promise<PriceListFormState>;
  defaultValues: PriceListValues;
  submitLabel: string;
  t: Dictionary["priceLists"];
  common: Dictionary["common"];
};

export function PriceListForm({
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
          maxLength={PRICE_LIST_NAME_MAX_LENGTH}
          placeholder={t.namePlaceholder}
        />
      </Field>

      <Field label={t.adjustment} error={state.errors?.adjustment}>
        {/* Texto y no number: acepta coma decimal y signo; el server valida. */}
        <Input
          name="adjustment"
          defaultValue={values.adjustment}
          required
          inputMode="decimal"
          placeholder="-10"
          className="w-32"
        />
        <span className="text-xs opacity-60">{t.adjustmentHint}</span>
      </Field>

      <FormError messages={state.errors?.form} />

      <div className="flex gap-3">
        <SubmitButton pending={pending} pendingLabel={common.saving}>
          {submitLabel}
        </SubmitButton>
        <Link href="/admin/price-lists" className={buttonClass("secondary")}>
          {common.cancel}
        </Link>
      </div>
    </form>
  );
}
