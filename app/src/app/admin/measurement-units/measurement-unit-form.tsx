"use client";

import Link from "next/link";
import { useActionState } from "react";
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
        <input
          name="name"
          defaultValue={values.name}
          required
          maxLength={20}
          placeholder="kg"
          className="rounded border border-current/20 bg-transparent px-3 py-2"
        />
      </Field>

      <Field label="Descripción (opcional)" error={state.errors?.description}>
        <input
          name="description"
          defaultValue={values.description}
          maxLength={100}
          placeholder="Kilogramo"
          className="rounded border border-current/20 bg-transparent px-3 py-2"
        />
      </Field>

      {state.errors?.form && (
        <p role="alert" className="text-sm text-red-600">
          {state.errors.form.join(". ")}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-foreground text-background rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Guardando…" : submitLabel}
        </button>
        <Link
          href="/admin/measurement-units"
          className="rounded border border-current/20 px-4 py-2 text-sm"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error && <span className="text-red-600">{error.join(". ")}</span>}
    </label>
  );
}
