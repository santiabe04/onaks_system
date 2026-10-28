"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  type MeasurementUnitFormState,
  type MeasurementUnitValues,
} from "@/lib/measurement-unit";

type Props = {
  action: (
    state: MeasurementUnitFormState,
    formData: FormData,
  ) => Promise<MeasurementUnitFormState>;
  defaultValues?: MeasurementUnitValues;
  submitLabel: string;
  t: Dictionary["measurementUnits"];
  common: Dictionary["common"];
};

export function MeasurementUnitForm({
  action,
  defaultValues,
  submitLabel,
  t,
  common,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  // Si hubo error, se muestra lo último que tipeó el usuario.
  const values = state.values ??
    defaultValues ?? {
      name: "",
      description: "",
      allowsDecimals: false,
    };

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field label={t.name} error={state.errors?.name}>
        <Input
          name="name"
          defaultValue={values.name}
          required
          maxLength={NAME_MAX_LENGTH}
          placeholder={t.namePlaceholder}
        />
      </Field>

      <Field label={t.descriptionOptional} error={state.errors?.description}>
        <Input
          name="description"
          defaultValue={values.description}
          maxLength={DESCRIPTION_MAX_LENGTH}
          placeholder={t.descriptionPlaceholder}
        />
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input
          key={String(values.allowsDecimals)}
          type="checkbox"
          name="allowsDecimals"
          defaultChecked={values.allowsDecimals}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">{t.allowsDecimals}</span>
          <span className="block text-xs opacity-60">
            {t.allowsDecimalsHint}
          </span>
        </span>
      </label>

      <FormError messages={state.errors?.form} />

      <div className="flex gap-3">
        <SubmitButton pending={pending} pendingLabel={common.saving}>
          {submitLabel}
        </SubmitButton>
        <Link
          href="/admin/measurement-units"
          className={buttonClass("secondary")}
        >
          {common.cancel}
        </Link>
      </div>
    </form>
  );
}
