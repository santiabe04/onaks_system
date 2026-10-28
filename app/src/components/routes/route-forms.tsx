"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  addStops,
  createRouteSheetFromSales,
  type RouteActionState,
} from "@/app/[lang]/admin/routes/actions";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  ROUTE_NOTES_MAX_LENGTH,
  type RouteSheetFormState,
  type RouteSheetValues,
} from "@/lib/route-sheet";
import { BULK_FORM_ID } from "../orders/bulk-state-bar";

const CONTROL = "rounded border border-current/20 bg-transparent px-3 py-2";

type FleetOptions = {
  drivers: { id: string; name: string }[];
  vehicles: { id: string; name: string }[];
};

/** Fecha, repartidor, vehículo y comentario (alta, edición y desde la zona). */
function SheetFields({
  values,
  errors,
  options,
  t,
}: {
  values: RouteSheetValues;
  errors?: RouteSheetFormState["errors"];
  options: FleetOptions;
  t: Dictionary["routes"];
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t.date} error={errors?.date}>
          <Input type="date" name="date" required defaultValue={values.date} />
        </Field>
        <Field label={t.driver} error={errors?.driverId}>
          <select
            key={values.driverId}
            name="driverId"
            required
            defaultValue={values.driverId}
            className={CONTROL}
          >
            <option value="" disabled>
              —
            </option>
            {options.drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.vehicle} error={errors?.vehicleId}>
          <select
            key={values.vehicleId}
            name="vehicleId"
            defaultValue={values.vehicleId}
            className={CONTROL}
          >
            <option value="">{t.noVehicle}</option>
            {options.vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t.notesOptional} error={errors?.notes}>
        <Input
          name="notes"
          defaultValue={values.notes}
          maxLength={ROUTE_NOTES_MAX_LENGTH}
        />
      </Field>
    </>
  );
}

export function RouteSheetForm({
  action,
  defaultValues,
  options,
  submitLabel,
  cancelHref,
  t,
  common,
}: {
  action: (
    state: RouteSheetFormState,
    formData: FormData,
  ) => Promise<RouteSheetFormState>;
  defaultValues: RouteSheetValues;
  options: FleetOptions;
  submitLabel: string;
  cancelHref?: string;
  t: Dictionary["routes"];
  common: Dictionary["common"];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4 text-sm">
      <SheetFields
        values={state.values ?? defaultValues}
        errors={state.errors}
        options={options}
        t={t}
      />
      <FormError messages={state.errors?.form} />
      <div className="flex gap-3">
        <SubmitButton pending={pending} pendingLabel={common.saving}>
          {submitLabel}
        </SubmitButton>
        {cancelHref && (
          <Link href={cancelHref} className={buttonClass("secondary")}>
            {common.cancel}
          </Link>
        )}
      </div>
    </form>
  );
}

/** Un botón que corre una acción de la hoja (salir, quitar, subir…) y muestra el error. */
export function SheetActionButton({
  action,
  label,
  pendingLabel,
  confirm,
  variant = "secondary",
  compact,
}: {
  action: () => Promise<RouteActionState>;
  label: string;
  pendingLabel?: string;
  /** Pregunta antes de correr (p. ej. al borrar). */
  confirm?: string;
  variant?: "primary" | "secondary" | "link" | "danger";
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState<RouteActionState>(
    action,
    {},
  );
  const className =
    variant === "link"
      ? "hover:underline disabled:opacity-50"
      : variant === "danger"
        ? "text-red-600 hover:underline disabled:opacity-50"
        : buttonClass(variant);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className={compact ? "inline" : "flex flex-col items-start gap-1"}
    >
      <button
        type="submit"
        disabled={pending}
        className={className}
        title={compact ? label : undefined}
        aria-label={label}
      >
        {pending && pendingLabel ? pendingLabel : label}
      </button>
      {state.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** Pedidos listos para despachar, para sumar a la hoja. */
export function AddStopsForm({
  sheetId,
  candidates,
  t,
}: {
  sheetId: string;
  candidates: {
    id: string;
    number: number;
    customer: string;
    address: string;
    city: string;
    /** Ya formateado ("$ 27.625,00"): las funciones no pasan al cliente. */
    total: string;
  }[];
  t: Dictionary["routes"];
}) {
  const [state, formAction, pending] = useActionState<
    RouteActionState,
    FormData
  >(addStops.bind(null, sheetId), {});
  if (candidates.length === 0) {
    return <p className="text-sm opacity-70">{t.noCandidates}</p>;
  }
  return (
    <form action={formAction} className="flex flex-col gap-3 text-sm">
      <p className="opacity-70">{t.addHint}</p>
      <ul className="flex flex-col gap-1">
        {candidates.map((sale) => (
          <li key={sale.id}>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="sale"
                value={sale.id}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">#{sale.number}</span> ·{" "}
                {sale.customer} · {sale.city}
                <span className="block text-xs opacity-70">
                  {sale.address} · {sale.total}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <FormError messages={state.error} />
      <div>
        <SubmitButton pending={pending} pendingLabel={t.working}>
          {t.add}
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * "Armar hoja de ruta" en la vista por zona: usa las casillas de la barra de
 * cambio masivo (marcadas en la tabla) y crea la hoja con esos pedidos.
 */
export function RouteFromSelection({
  options,
  today,
  t,
}: {
  options: FleetOptions;
  today: string;
  t: Dictionary["routes"];
}) {
  const [state, formAction, pending] = useActionState<
    RouteSheetFormState,
    FormData
  >(async (prev, formData) => {
    // Las casillas pertenecen al form de la barra masiva: se copian acá.
    const boxes = document.querySelectorAll<HTMLInputElement>(
      `input[type=checkbox][form=${BULK_FORM_ID}][name=sale]:checked`,
    );
    for (const box of boxes) formData.append("sale", box.value);
    return createRouteSheetFromSales(prev, formData);
  }, {});

  return (
    <details className="mt-4 rounded border border-current/20 p-4 text-sm print:hidden">
      <summary className="cursor-pointer font-medium">{t.fromZone}</summary>
      <form action={formAction} className="mt-3 flex flex-col gap-4">
        <p className="opacity-70">{t.fromZoneHint}</p>
        <SheetFields
          values={
            state.values ?? {
              date: today,
              driverId:
                options.drivers.length === 1 ? options.drivers[0].id : "",
              vehicleId: "",
              notes: "",
            }
          }
          errors={state.errors}
          options={options}
          t={t}
        />
        <FormError messages={state.errors?.form} />
        <div>
          <SubmitButton pending={pending} pendingLabel={t.working}>
            {t.create}
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}
