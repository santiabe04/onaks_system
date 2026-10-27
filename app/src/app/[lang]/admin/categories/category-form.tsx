"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  CATEGORY_NAME_MAX_LENGTH,
  MAX_CATEGORY_DEPTH,
  type CategoryFormState,
  type CategoryValues,
} from "@/lib/category";

type Props = {
  action: (
    state: CategoryFormState,
    formData: FormData,
  ) => Promise<CategoryFormState>;
  defaultValues: CategoryValues;
  /** Padres posibles, ya filtrados (sin ciclos ni un cuarto nivel). */
  parents: { id: number; label: string }[];
  submitLabel: string;
  t: Dictionary["categories"];
  common: Dictionary["common"];
};

export function CategoryForm({
  action,
  defaultValues,
  parents,
  submitLabel,
  t,
  common,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  // Si hubo error, se muestra lo último que eligió el usuario.
  const values = state.values ?? defaultValues;

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field label={t.name} error={state.errors?.name}>
        <Input
          name="name"
          defaultValue={values.name}
          required
          maxLength={CATEGORY_NAME_MAX_LENGTH}
          placeholder={t.namePlaceholder}
        />
      </Field>

      <Field label={t.parent} error={state.errors?.parentId}>
        {/* key: al volver con error, el select toma el valor nuevo. */}
        <select
          key={values.parentId}
          name="parentId"
          defaultValue={values.parentId}
          className="rounded border border-current/20 bg-transparent px-3 py-2"
        >
          <option value="">{t.noParent}</option>
          {parents.map((parent) => (
            <option key={parent.id} value={parent.id}>
              {parent.label}
            </option>
          ))}
        </select>
        <span className="text-xs opacity-60">
          {interpolate(t.parentHint, { max: MAX_CATEGORY_DEPTH })}
        </span>
      </Field>

      <FormError messages={state.errors?.form} />

      <div className="flex gap-3">
        <SubmitButton pending={pending} pendingLabel={common.saving}>
          {submitLabel}
        </SubmitButton>
        <Link href="/admin/categories" className={buttonClass("secondary")}>
          {common.cancel}
        </Link>
      </div>
    </form>
  );
}
