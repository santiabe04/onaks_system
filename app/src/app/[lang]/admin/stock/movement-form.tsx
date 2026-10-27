"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  commentRequired,
  MANUAL_MOVEMENTS,
  STOCK_COMMENT_MAX_LENGTH,
  type ManualMovement,
  type MovementFormState,
  type MovementValues,
} from "@/lib/stock";
import { createMovement } from "./actions";

type Option = { id: string; label: string };

type Props = {
  defaultValues: MovementValues;
  products: Option[];
  warehouses: Option[];
  /** Saldos del producto preseleccionado, ya formateados ("Central: 12"). */
  balances?: string;
  cancelHref: string;
  t: Dictionary["stock"];
  common: Dictionary["common"];
};

const selectClass = "rounded border border-current/20 bg-transparent px-3 py-2";

function asType(value: string): ManualMovement {
  return (MANUAL_MOVEMENTS as readonly string[]).includes(value)
    ? (value as ManualMovement)
    : "ENTRY";
}

export function MovementForm({
  defaultValues,
  products,
  warehouses,
  balances,
  cancelHref,
  t,
  common,
}: Props) {
  const [state, formAction, pending] = useActionState<
    MovementFormState,
    FormData
  >(createMovement, {});
  // Si hubo error, se muestra lo último que cargó el usuario.
  const values = state.values ?? defaultValues;
  const errors = state.errors;
  // El tipo cambia qué campos se ven; el select no es controlado (tras una
  // action React resetea el form a los defaultValue).
  const [type, setType] = useState(asType(values.type));
  const isTransfer = type === "TRANSFER";
  const isAdjustment = type === "ADJUSTMENT";

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field label={t.type} error={errors?.type}>
        <select
          key={`t${values.type}`}
          name="type"
          defaultValue={asType(values.type)}
          onChange={(event) => setType(asType(event.target.value))}
          className={selectClass}
        >
          {MANUAL_MOVEMENTS.map((option) => (
            <option key={option} value={option}>
              {t.types[option]}
            </option>
          ))}
        </select>
      </Field>

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
        {balances && <span className="text-xs opacity-70">{balances}</span>}
      </Field>

      <div className={`grid gap-4 ${isTransfer ? "sm:grid-cols-2" : ""}`}>
        <Field
          label={isTransfer ? t.fromWarehouse : t.warehouse}
          error={errors?.warehouseId}
        >
          <select
            key={`w${values.warehouseId}`}
            name="warehouseId"
            defaultValue={values.warehouseId}
            required
            className={selectClass}
          >
            <option value="" disabled>
              {t.warehousePlaceholder}
            </option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.label}
              </option>
            ))}
          </select>
        </Field>
        {isTransfer && (
          <Field label={t.toWarehouse} error={errors?.toWarehouseId}>
            <select
              key={`d${values.toWarehouseId}`}
              name="toWarehouseId"
              defaultValue={values.toWarehouseId}
              required
              className={selectClass}
            >
              <option value="" disabled>
                {t.warehousePlaceholder}
              </option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field
        label={isAdjustment ? t.counted : t.quantity}
        error={errors?.quantity}
      >
        <Input
          key={`q${values.quantity}`}
          name="quantity"
          defaultValue={values.quantity}
          required
          inputMode="decimal"
          placeholder={isAdjustment ? "37" : "12,5"}
          className="w-40"
        />
        <span className="text-xs opacity-60">
          {isAdjustment ? t.countedHint : t.quantityHint}
        </span>
      </Field>

      <Field
        label={commentRequired(type) ? t.comment : t.commentOptional}
        error={errors?.comment}
      >
        <Input
          key={`c${values.comment}`}
          name="comment"
          defaultValue={values.comment}
          required={commentRequired(type)}
          maxLength={STOCK_COMMENT_MAX_LENGTH}
          placeholder={t.commentPlaceholder}
        />
      </Field>

      <FormError messages={errors?.form} />

      <div className="flex gap-3">
        <SubmitButton pending={pending} pendingLabel={common.saving}>
          {t.register}
        </SubmitButton>
        <Link href={cancelHref} className={buttonClass("secondary")}>
          {common.cancel}
        </Link>
      </div>
    </form>
  );
}
