"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  FLEET_LIMITS,
  type DriverValues,
  type FormState,
  type VehicleValues,
} from "@/lib/fleet";

type Action<V> = (
  state: FormState<V>,
  formData: FormData,
) => Promise<FormState<V>>;

function ActiveCheckbox({
  checked,
  t,
}: {
  checked: boolean;
  t: Dictionary["fleet"];
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        key={String(checked)}
        type="checkbox"
        name="isActive"
        defaultChecked={checked}
        className="mt-0.5"
      />
      <span>
        <span className="font-medium">{t.isActive}</span>
        <span className="block text-xs opacity-60">{t.isActiveHint}</span>
      </span>
    </label>
  );
}

function Buttons({
  pending,
  submitLabel,
  cancelHref,
  common,
}: {
  pending: boolean;
  submitLabel: string;
  cancelHref: string;
  common: Dictionary["common"];
}) {
  return (
    <div className="flex gap-3">
      <SubmitButton pending={pending} pendingLabel={common.saving}>
        {submitLabel}
      </SubmitButton>
      <Link href={cancelHref} className={buttonClass("secondary")}>
        {common.cancel}
      </Link>
    </div>
  );
}

export function DriverForm({
  action,
  defaultValues,
  users,
  submitLabel,
  t,
  common,
}: {
  action: Action<DriverValues>;
  defaultValues: DriverValues;
  /** Usuarios internos libres (más el que ya tiene, al editar). */
  users: { id: string; label: string }[];
  submitLabel: string;
  t: Dictionary["fleet"];
  common: Dictionary["common"];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // Si hubo error, se muestra lo último que cargó el usuario.
  const values = state.values ?? defaultValues;
  const errors = state.errors;

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field label={t.name} error={errors?.name}>
        <Input
          name="name"
          defaultValue={values.name}
          required
          maxLength={FLEET_LIMITS.name}
        />
      </Field>
      <Field label={t.phoneOptional} error={errors?.phone}>
        <Input
          name="phone"
          type="tel"
          defaultValue={values.phone}
          maxLength={FLEET_LIMITS.phone}
        />
      </Field>
      <Field label={t.userOptional} error={errors?.userId}>
        <select
          key={values.userId}
          name="userId"
          defaultValue={values.userId}
          className="rounded border border-current/20 bg-transparent px-3 py-2"
        >
          <option value="">{t.noUser}</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.label}
            </option>
          ))}
        </select>
        <span className="text-xs opacity-60">{t.userHint}</span>
      </Field>
      <ActiveCheckbox checked={values.isActive} t={t} />
      <FormError messages={errors?.form} />
      <Buttons
        pending={pending}
        submitLabel={submitLabel}
        cancelHref="/admin/drivers"
        common={common}
      />
    </form>
  );
}

export function VehicleForm({
  action,
  defaultValues,
  submitLabel,
  t,
  common,
}: {
  action: Action<VehicleValues>;
  defaultValues: VehicleValues;
  submitLabel: string;
  t: Dictionary["fleet"];
  common: Dictionary["common"];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? defaultValues;
  const errors = state.errors;

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field label={t.vehicleName} error={errors?.name}>
        <Input
          name="name"
          defaultValue={values.name}
          required
          maxLength={FLEET_LIMITS.name}
          placeholder={t.vehicleNamePlaceholder}
        />
      </Field>
      <Field label={t.plateOptional} error={errors?.plate}>
        <Input
          name="plate"
          defaultValue={values.plate}
          maxLength={FLEET_LIMITS.plate + 4}
          className="uppercase"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.capacityKgOptional} error={errors?.capacityKg}>
          <Input
            name="capacityKg"
            inputMode="decimal"
            defaultValue={values.capacityKg}
          />
        </Field>
        <Field label={t.capacityLitersOptional} error={errors?.capacityLiters}>
          <Input
            name="capacityLiters"
            inputMode="decimal"
            defaultValue={values.capacityLiters}
          />
        </Field>
      </div>
      <p className="-mt-2 text-xs opacity-60">{t.capacityHint}</p>
      <ActiveCheckbox checked={values.isActive} t={t} />
      <FormError messages={errors?.form} />
      <Buttons
        pending={pending}
        submitLabel={submitLabel}
        cancelHref="/admin/vehicles"
        common={common}
      />
    </form>
  );
}
