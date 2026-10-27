"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import { TaxCondition } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { CityGroup } from "@/lib/city-options";
import {
  SUPPLIER_LIMITS,
  type SupplierFormState,
  type SupplierValues,
} from "@/lib/supplier";

type Props = {
  action: (
    state: SupplierFormState,
    formData: FormData,
  ) => Promise<SupplierFormState>;
  defaultValues: SupplierValues;
  cityGroups: CityGroup[];
  cancelHref: string;
  submitLabel: string;
  t: Dictionary["suppliers"];
  taxConditions: Dictionary["taxConditions"];
  common: Dictionary["common"];
};

const selectClass = "rounded border border-current/20 bg-transparent px-3 py-2";

export function SupplierForm({
  action,
  defaultValues,
  cityGroups,
  cancelHref,
  submitLabel,
  t,
  taxConditions,
  common,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  // Si hubo error, se muestra lo último que cargó el usuario.
  const values = state.values ?? defaultValues;
  const errors = state.errors;

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-6">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-medium">{t.fiscal}</legend>
        <Field label={t.legalName} error={errors?.legalName}>
          <Input
            name="legalName"
            defaultValue={values.legalName}
            required
            maxLength={SUPPLIER_LIMITS.legalName}
            placeholder={t.legalNamePlaceholder}
          />
        </Field>
        <Field label={t.tradeName} error={errors?.tradeName}>
          <Input
            name="tradeName"
            defaultValue={values.tradeName}
            maxLength={SUPPLIER_LIMITS.tradeName}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.cuit} error={errors?.cuit}>
            <Input
              name="cuit"
              defaultValue={values.cuit}
              required
              inputMode="numeric"
              maxLength={13}
              placeholder="30-50001091-2"
              className="font-mono"
            />
          </Field>
          <Field label={t.taxCondition} error={errors?.taxCondition}>
            {/* key: al volver con error, el select toma el valor nuevo. */}
            <select
              key={`tc${values.taxCondition}`}
              name="taxCondition"
              defaultValue={values.taxCondition}
              required
              className={selectClass}
            >
              <option value="" disabled>
                {t.taxConditionPlaceholder}
              </option>
              {Object.values(TaxCondition).map((condition) => (
                <option key={condition} value={condition}>
                  {taxConditions[condition]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-medium">{t.contact}</legend>
        <Field label={t.contactName} error={errors?.contactName}>
          <Input
            name="contactName"
            defaultValue={values.contactName}
            maxLength={SUPPLIER_LIMITS.contactName}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.contactMail} error={errors?.contactMail}>
            <Input
              name="contactMail"
              type="email"
              defaultValue={values.contactMail}
              maxLength={SUPPLIER_LIMITS.contactMail}
            />
          </Field>
          <Field label={t.contactPhone} error={errors?.contactPhone}>
            <Input
              name="contactPhone"
              type="tel"
              defaultValue={values.contactPhone}
              maxLength={SUPPLIER_LIMITS.contactPhone}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-medium">{t.location}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.address} error={errors?.address}>
            <Input
              name="address"
              defaultValue={values.address}
              maxLength={SUPPLIER_LIMITS.address}
            />
          </Field>
          <Field label={t.city} error={errors?.cityId}>
            <select
              key={`c${values.cityId}`}
              name="cityId"
              defaultValue={values.cityId}
              className={selectClass}
            >
              <option value="">{t.noCity}</option>
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
        </div>
      </fieldset>

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
        <Link href={cancelHref} className={buttonClass("secondary")}>
          {common.cancel}
        </Link>
      </div>
    </form>
  );
}
