"use client";

import { useActionState } from "react";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  SUPPLIER_LIMITS,
  type SupplierProductFormState,
  type SupplierProductValues,
} from "@/lib/supplier";

type Props = {
  action: (
    state: SupplierProductFormState,
    formData: FormData,
  ) => Promise<SupplierProductFormState>;
  /** Con `?product=` precarga los datos actuales de ese producto. */
  defaultValues: SupplierProductValues;
  products: { id: string; label: string }[];
  t: Dictionary["suppliers"];
  common: Dictionary["common"];
};

const selectClass = "rounded border border-current/20 bg-transparent px-3 py-2";

export function SupplierProductForm({
  action,
  defaultValues,
  products,
  t,
  common,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  // Tras guardar bien (savedAt) el form vuelve a vacío para cargar el siguiente.
  const values = state.values ?? (state.savedAt ? empty : defaultValues);
  const errors = state.errors;
  const key = `${state.savedAt ?? 0}`;

  return (
    <form
      key={key}
      action={formAction}
      className="mt-3 grid items-start gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
    >
      <Field label={t.product} error={errors?.productId}>
        <select
          key={`p${values.productId}`}
          name="productId"
          defaultValue={values.productId}
          required
          className={selectClass}
        >
          <option value="" disabled>
            {t.productPlaceholder}
          </option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.supplierCode} error={errors?.supplierCode}>
        <Input
          key={`s${values.supplierCode}`}
          name="supplierCode"
          defaultValue={values.supplierCode}
          maxLength={SUPPLIER_LIMITS.supplierCode}
          className="font-mono"
        />
      </Field>
      <Field label={t.lastCost} error={errors?.lastCost}>
        <Input
          key={`l${values.lastCost}`}
          name="lastCost"
          defaultValue={values.lastCost}
          inputMode="decimal"
          placeholder="18500,50"
        />
      </Field>
      <div className="flex flex-col gap-1 text-sm">
        {/* Alinea el botón con los inputs (que tienen label arriba). */}
        <span aria-hidden className="invisible font-medium">
          ·
        </span>
        <SubmitButton pending={pending} pendingLabel={common.saving}>
          {t.saveProduct}
        </SubmitButton>
      </div>
      <div className="sm:col-span-4">
        <FormError messages={errors?.form} />
      </div>
    </form>
  );
}

const empty: SupplierProductValues = {
  productId: "",
  supplierCode: "",
  lastCost: "",
};
