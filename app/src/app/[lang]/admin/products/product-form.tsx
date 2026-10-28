"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  MEASURE_LIMITS,
  parseDecimalInput,
  PRICE_LIMITS,
} from "@/lib/decimal-input";
import { finalPrice } from "@/lib/price";
import {
  PRODUCT_LIMITS,
  productImageUrl,
  type ProductFormState,
  type ProductValues,
} from "@/lib/product";
import type { ProductFormOptions } from "./form-options";

type Props = {
  action: (
    state: ProductFormState,
    formData: FormData,
  ) => Promise<ProductFormState>;
  defaultValues: ProductValues;
  /** Archivo de la imagen actual (al editar). */
  imageFile?: string | null;
  options: ProductFormOptions;
  /** Formato de plata del idioma, armado en el server ("es-AR", "en-US"). */
  intlLocale: string;
  submitLabel: string;
  t: Dictionary["products"];
  common: Dictionary["common"];
};

const selectClass = "rounded border border-current/20 bg-transparent px-3 py-2";

export function ProductForm({
  action,
  defaultValues,
  imageFile,
  options,
  intlLocale,
  submitLabel,
  t,
  common,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  // Si hubo error, se muestra lo último que cargó el usuario.
  const values = state.values ?? defaultValues;
  const errors = state.errors;

  // Vista previa del precio final: se recalcula al tipear el neto o cambiar la alícuota.
  const [price, setPrice] = useState(values.price);
  const [taxRateId, setTaxRateId] = useState(values.taxRateId);
  const net = parseDecimalInput(price, PRICE_LIMITS);
  const rate = options.taxRates.find((r) => String(r.id) === taxRateId)?.rate;
  const preview =
    net !== null && rate !== undefined
      ? new Intl.NumberFormat(intlLocale, {
          style: "currency",
          currency: "ARS",
        }).format(Number(finalPrice(net, rate)))
      : null;

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field label={t.name} error={errors?.name}>
        <Input
          name="name"
          defaultValue={values.name}
          required
          maxLength={PRODUCT_LIMITS.name}
          placeholder={t.namePlaceholder}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.sku} error={errors?.sku}>
          <Input
            name="sku"
            defaultValue={values.sku}
            required
            maxLength={PRODUCT_LIMITS.sku}
            placeholder={t.skuPlaceholder}
            className="font-mono uppercase"
          />
        </Field>
        <Field label={t.barcode} error={errors?.barcode}>
          <Input
            name="barcode"
            defaultValue={values.barcode}
            inputMode="numeric"
            maxLength={14}
            className="font-mono"
          />
        </Field>
      </div>

      <Field label={t.description} error={errors?.description}>
        <textarea
          name="description"
          defaultValue={values.description}
          maxLength={PRODUCT_LIMITS.description}
          rows={3}
          className={selectClass}
        />
      </Field>

      <Field label={t.category} error={errors?.categoryId}>
        {/* key: al volver con error, el select toma el valor nuevo. */}
        <select
          key={`c${values.categoryId}`}
          name="categoryId"
          defaultValue={values.categoryId}
          required
          className={selectClass}
        >
          <option value="" disabled>
            {t.categoryPlaceholder}
          </option>
          {options.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        <span className="text-xs opacity-60">{t.categoryHint}</span>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.price} error={errors?.price}>
          {/* No controlados (como el resto): tras una action React resetea el
              form a los defaultValue, que son lo último enviado. El onChange
              solo alimenta la vista previa del precio final. */}
          <Input
            key={`p${values.price}`}
            name="price"
            defaultValue={values.price}
            onChange={(event) => setPrice(event.target.value)}
            required
            inputMode="decimal"
            placeholder="25000,50"
          />
        </Field>
        <Field label={t.taxRate} error={errors?.taxRateId}>
          <select
            key={`t${values.taxRateId}`}
            name="taxRateId"
            defaultValue={values.taxRateId}
            onChange={(event) => setTaxRateId(event.target.value)}
            required
            className={selectClass}
          >
            <option value="" disabled>
              {t.taxRatePlaceholder}
            </option>
            {options.taxRates.map((taxRate) => (
              <option key={taxRate.id} value={taxRate.id}>
                {taxRate.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {preview && (
        <p className="-mt-2 text-sm opacity-80" aria-live="polite">
          {interpolate(t.finalPriceHint, { price: preview })}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t.unit} error={errors?.measurementUnitId}>
          <select
            key={`u${values.measurementUnitId}`}
            name="measurementUnitId"
            defaultValue={values.measurementUnitId}
            required
            className={selectClass}
          >
            <option value="" disabled>
              {t.unitPlaceholder}
            </option>
            {options.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.weight} error={errors?.weight}>
          <Input
            name="weight"
            defaultValue={values.weight}
            required
            inputMode="decimal"
            placeholder="15"
            maxLength={
              MEASURE_LIMITS.maxIntegerDigits + MEASURE_LIMITS.maxDecimals + 1
            }
          />
        </Field>
        <Field label={t.volume} error={errors?.volume}>
          <Input
            name="volume"
            defaultValue={values.volume}
            inputMode="decimal"
            placeholder="25"
          />
        </Field>
        <Field label={t.minStock} error={errors?.minStock}>
          <Input
            name="minStock"
            defaultValue={values.minStock}
            inputMode="decimal"
            placeholder="10"
          />
        </Field>
      </div>

      <Field label={t.image} error={errors?.image}>
        {imageFile && (
          <div className="flex items-center gap-3">
            <Image
              src={productImageUrl(imageFile)}
              alt={t.imageCurrent}
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16 rounded border border-current/20 object-cover"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="removeImage" />
              {t.removeImage}
            </label>
          </div>
        )}
        <input
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          className="text-sm"
        />
        <span className="text-xs opacity-60">
          {t.imageHint} {state.errors && t.imageRetry}
        </span>
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
        <Link href="/admin/products" className={buttonClass("secondary")}>
          {common.cancel}
        </Link>
      </div>
    </form>
  );
}
