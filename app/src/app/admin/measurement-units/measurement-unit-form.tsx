"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type {
  MeasurementUnitFormState,
  MeasurementUnitValues,
} from "@/lib/measurement-unit";

type Props = {
  action: (
    state: MeasurementUnitFormState,
    formData: FormData,
  ) => Promise<MeasurementUnitFormState>;
  defaultValues?: MeasurementUnitValues;
  submitLabel: string;
};

export function MeasurementUnitForm({
  action,
  defaultValues,
  submitLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  // Si hubo error, se muestra lo último que tipeó el usuario.
  const values = state.values ?? defaultValues ?? { name: "", description: "" };

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field label="Nombre" error={state.errors?.name}>
        <Input
          name="name"
          defaultValue={values.name}
          required
          maxLength={20}
          placeholder="kg"
        />
      </Field>

      <Field label="Descripción (opcional)" error={state.errors?.description}>
        <Input
          name="description"
          defaultValue={values.description}
          maxLength={100}
          placeholder="Kilogramo"
        />
      </Field>

      <FormError messages={state.errors?.form} />

      <div className="flex gap-3">
        <SubmitButton pending={pending} pendingLabel="Guardando…">
          {submitLabel}
        </SubmitButton>
        <Link
          href="/admin/measurement-units"
          className={buttonClass("secondary")}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
