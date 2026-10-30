"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import { TaxCondition } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { CityGroup } from "@/lib/city-options";
import {
  CUSTOMER_LIMITS,
  type AddressValues,
  type CustomerValues,
  type FormState,
  type PersonValues,
} from "@/lib/customer";

type Action<V> = (
  state: FormState<V>,
  formData: FormData,
) => Promise<FormState<V>>;

type Common = {
  cancelHref: string;
  submitLabel: string;
  t: Dictionary["customers"];
  common: Dictionary["common"];
};

const selectClass = "rounded border border-current/20 bg-transparent px-3 py-2";

/** Botones y error general, iguales en los tres forms. */
function Footer({
  pending,
  errors,
  cancelHref,
  submitLabel,
  common,
}: {
  pending: boolean;
  errors?: string[];
  cancelHref: string;
  submitLabel: string;
  common: Dictionary["common"];
}) {
  return (
    <>
      <FormError messages={errors} />
      <div className="flex gap-3">
        <SubmitButton pending={pending} pendingLabel={common.saving}>
          {submitLabel}
        </SubmitButton>
        <Link href={cancelHref} className={buttonClass("secondary")}>
          {common.cancel}
        </Link>
      </div>
    </>
  );
}

function Form({
  action,
  children,
}: {
  action: (formData: FormData) => void;
  children: ReactNode;
}) {
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      {children}
    </form>
  );
}

export function CustomerForm({
  action,
  defaultValues,
  taxConditions,
  priceLists,
  ...props
}: Common & {
  action: Action<CustomerValues>;
  defaultValues: CustomerValues;
  taxConditions: Dictionary["taxConditions"];
  priceLists: { id: string; name: string }[];
}) {
  const { t } = props;
  const [state, formAction, pending] = useActionState(action, {});
  // Si hubo error, se muestra lo último que cargó el usuario.
  const values = state.values ?? defaultValues;
  const errors = state.errors;

  return (
    <Form action={formAction}>
      <Field label={t.tradeName} error={errors?.tradeName}>
        <Input
          name="tradeName"
          defaultValue={values.tradeName}
          required
          maxLength={CUSTOMER_LIMITS.tradeName}
          placeholder={t.tradeNamePlaceholder}
        />
      </Field>
      <Field label={t.legalName} error={errors?.legalName}>
        <Input
          name="legalName"
          defaultValue={values.legalName}
          required
          maxLength={CUSTOMER_LIMITS.legalName}
          placeholder={t.legalNamePlaceholder}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.priceList} error={errors?.priceListId}>
          <select
            key={`pl${values.priceListId}`}
            name="priceListId"
            defaultValue={values.priceListId}
            className={selectClass}
          >
            <option value="">{t.noPriceList}</option>
            {priceLists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.discount} error={errors?.discount}>
          <Input
            name="discount"
            defaultValue={values.discount}
            inputMode="decimal"
            placeholder="0"
          />
          <span className="text-xs opacity-60">{t.discountHint}</span>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.creditLimit} error={errors?.creditLimit}>
          <Input
            name="creditLimit"
            defaultValue={values.creditLimit}
            inputMode="decimal"
          />
          <span className="text-xs opacity-60">{t.creditLimitHint}</span>
        </Field>
        <Field label={t.paymentTermDays} error={errors?.paymentTermDays}>
          <Input
            name="paymentTermDays"
            defaultValue={values.paymentTermDays}
            inputMode="numeric"
          />
          <span className="text-xs opacity-60">{t.paymentTermHint}</span>
        </Field>
      </div>
      <Footer pending={pending} errors={errors?.form} {...props} />
    </Form>
  );
}

export function PersonForm({
  action,
  defaultValues,
  ...props
}: Common & { action: Action<PersonValues>; defaultValues: PersonValues }) {
  const { t } = props;
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? defaultValues;
  const errors = state.errors;

  return (
    <Form action={formAction}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.name} error={errors?.name}>
          <Input
            name="name"
            defaultValue={values.name}
            required
            maxLength={CUSTOMER_LIMITS.personName}
            autoComplete="off"
          />
        </Field>
        <Field label={t.surname} error={errors?.surname}>
          <Input
            name="surname"
            defaultValue={values.surname}
            required
            maxLength={CUSTOMER_LIMITS.personName}
            autoComplete="off"
          />
        </Field>
      </div>
      <Field label={t.mail} error={errors?.mail}>
        <Input
          name="mail"
          type="email"
          defaultValue={values.mail}
          required
          maxLength={CUSTOMER_LIMITS.mail}
          autoComplete="off"
        />
        <span className="text-xs opacity-60">{t.mailHint}</span>
      </Field>
      <Field label={t.phone} error={errors?.phone}>
        <Input
          name="phone"
          type="tel"
          defaultValue={values.phone}
          maxLength={CUSTOMER_LIMITS.phone}
        />
      </Field>
      <Footer pending={pending} errors={errors?.form} {...props} />
    </Form>
  );
}

export function AddressForm({
  action,
  defaultValues,
  cityGroups,
  ...props
}: Common & {
  action: Action<AddressValues>;
  defaultValues: AddressValues;
  cityGroups: CityGroup[];
}) {
  const { t } = props;
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? defaultValues;
  const errors = state.errors;

  return (
    <Form action={formAction}>
      <Field label={t.addressName} error={errors?.name}>
        <Input
          name="name"
          defaultValue={values.name}
          required
          maxLength={CUSTOMER_LIMITS.addressName}
          placeholder={t.addressNamePlaceholder}
        />
      </Field>
      <Field label={t.address} error={errors?.address}>
        <Input
          name="address"
          defaultValue={values.address}
          required
          maxLength={CUSTOMER_LIMITS.address}
          placeholder={t.addressPlaceholder}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label={t.city} error={errors?.cityId}>
          <select
            key={`c${values.cityId}`}
            name="cityId"
            defaultValue={values.cityId}
            required
            className={selectClass}
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
        <Field label={t.zipCode} error={errors?.zipCode}>
          <Input
            name="zipCode"
            defaultValue={values.zipCode}
            maxLength={CUSTOMER_LIMITS.zipCode}
          />
        </Field>
      </div>
      <Field label={t.description} error={errors?.description}>
        <Input
          name="description"
          defaultValue={values.description}
          maxLength={CUSTOMER_LIMITS.addressDescription}
          placeholder={t.descriptionPlaceholder}
        />
      </Field>
      <Footer pending={pending} errors={errors?.form} {...props} />
    </Form>
  );
}
