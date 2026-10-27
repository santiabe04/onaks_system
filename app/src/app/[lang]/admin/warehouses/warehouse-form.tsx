"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { CityGroup } from "@/lib/city-options";
import {
  WAREHOUSE_LIMITS,
  type WarehouseFormState,
  type WarehouseValues,
} from "@/lib/warehouse";

type Props = {
  action: (
    state: WarehouseFormState,
    formData: FormData,
  ) => Promise<WarehouseFormState>;
  defaultValues: WarehouseValues;
  cityGroups: CityGroup[];
  submitLabel: string;
  t: Dictionary["warehouses"];
  common: Dictionary["common"];
};

export function WarehouseForm({
  action,
  defaultValues,
  cityGroups,
  submitLabel,
  t,
  common,
}: Props) {
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
          maxLength={WAREHOUSE_LIMITS.name}
          placeholder={t.namePlaceholder}
        />
      </Field>

      <Field label={t.address} error={errors?.address}>
        <Input
          name="address"
          defaultValue={values.address}
          required
          maxLength={WAREHOUSE_LIMITS.address}
          placeholder={t.addressPlaceholder}
        />
      </Field>

      <Field label={t.city} error={errors?.cityId}>
        {/* key: al volver con error, el select toma el valor nuevo. */}
        <select
          key={values.cityId}
          name="cityId"
          defaultValue={values.cityId}
          required
          className="rounded border border-current/20 bg-transparent px-3 py-2"
        >
          <option value="" disabled>
            {t.cityPlaceholder}
          </option>
          {cityGroups.map((group) => (
            <optgroup key={group.state} label={group.state}>
              {group.cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>

      <Field label={t.phone} error={errors?.phone}>
        <Input
          name="phone"
          type="tel"
          defaultValue={values.phone}
          maxLength={WAREHOUSE_LIMITS.phone}
        />
      </Field>

      <Field label={t.contactName} error={errors?.contactName}>
        <Input
          name="contactName"
          defaultValue={values.contactName}
          maxLength={WAREHOUSE_LIMITS.contactName}
        />
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

      <FormError messages={errors?.form} />

      <div className="flex gap-3">
        <SubmitButton pending={pending} pendingLabel={common.saving}>
          {submitLabel}
        </SubmitButton>
        <Link href="/admin/warehouses" className={buttonClass("secondary")}>
          {common.cancel}
        </Link>
      </div>
    </form>
  );
}
