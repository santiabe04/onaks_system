"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { LOCATION_NAME_MAX_LENGTH } from "@/lib/location";

/** State shared by the province and city forms. */
type FormState = {
  errors?: Partial<Record<"name" | "stateId" | "form", string[]>>;
  values?: { name: string; stateId?: string };
};

// The province or city action: each one types its own state.
type Action = (state: never, formData: FormData) => Promise<FormState>;

type Props = {
  action: Action;
  defaultValues: { name: string; stateId?: string };
  /** Only for cities: the provinces to choose from. */
  states?: { id: number; name: string }[];
  placeholder: string;
  submitLabel: string;
  t: Dictionary["locations"];
  common: Dictionary["common"];
};

export function LocationForm({
  action,
  defaultValues,
  states,
  placeholder,
  submitLabel,
  t,
  common,
}: Props) {
  // Safe: the action only receives the initial state ({}) or the one it
  // itself returned, which is of its own type.
  const [state, formAction, pending] = useActionState(
    action as (state: FormState, formData: FormData) => Promise<FormState>,
    {},
  );
  // If there was an error, the user's last input is shown.
  const values = state.values ?? defaultValues;

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      {states && (
        <Field label={t.state} error={state.errors?.stateId}>
          {/* key: when returning with an error, the select takes the new value. */}
          <select
            key={values.stateId}
            name="stateId"
            defaultValue={values.stateId}
            required
            className="rounded border border-current/20 bg-transparent px-3 py-2"
          >
            <option value="" disabled>
              {t.statePick}
            </option>
            {states.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label={t.name} error={state.errors?.name}>
        <Input
          name="name"
          defaultValue={values.name}
          required
          maxLength={LOCATION_NAME_MAX_LENGTH}
          placeholder={placeholder}
        />
      </Field>

      <FormError messages={state.errors?.form} />

      <div className="flex gap-3">
        <SubmitButton pending={pending} pendingLabel={common.saving}>
          {submitLabel}
        </SubmitButton>
        <Link href="/admin/locations" className={buttonClass("secondary")}>
          {common.cancel}
        </Link>
      </div>
    </form>
  );
}
