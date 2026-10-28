"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import type { PaymentMethod } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { STOP_LIMITS } from "@/lib/stop-record";
import { recordStop, type StopActionState } from "../../actions";

const CONTROL =
  "w-full rounded border border-current/20 bg-transparent px-3 py-3 text-base";

/** Ubicación del celular, si la da en unos segundos (si no, se sigue sin ella). */
function currentPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 60_000,
    });
  });
}

/** Carga de una parada: entregado (firma o foto, cobro) o no entregado (motivo). */
export function StopForm({
  stopId,
  suggestedAmount,
  t,
  methods,
}: {
  stopId: string;
  /** Lo que hay que cobrar, para precargar ("29860,5"); vacío si no hay. */
  suggestedAmount: string;
  t: Dictionary["delivery"];
  methods: Dictionary["orders"]["paymentMethods"];
}) {
  const [outcome, setOutcome] = useState<"DELIVERED" | "NOT_DELIVERED">(
    "DELIVERED",
  );
  const [state, action, pending] = useActionState<StopActionState, FormData>(
    async (prev, formData) => {
      const position = await currentPosition();
      if (position) {
        formData.set("latitude", String(position.coords.latitude));
        formData.set("longitude", String(position.coords.longitude));
        formData.set("accuracy", String(position.coords.accuracy));
      }
      return recordStop(stopId, prev, formData);
    },
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-2 font-medium">{t.outcome}</legend>
        {(["DELIVERED", "NOT_DELIVERED"] as const).map((value) => (
          <label
            key={value}
            className={`flex items-center justify-center gap-2 rounded border p-3 text-base ${
              outcome === value
                ? "border-current font-semibold"
                : "border-current/20"
            }`}
          >
            <input
              type="radio"
              name="outcome"
              value={value}
              checked={outcome === value}
              onChange={() => setOutcome(value)}
              className="sr-only"
            />
            {value === "DELIVERED" ? `✓ ${t.delivered}` : `✕ ${t.notDelivered}`}
          </label>
        ))}
      </fieldset>

      {outcome === "DELIVERED" ? (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="font-medium">{t.proof}</h2>
            <p className="text-sm opacity-70">{t.proofHint}</p>
            <SignaturePad label={t.signHere} clearLabel={t.clear} />
            <label className="flex flex-col gap-1 text-sm">
              <span>{t.receiverName}</span>
              <input
                name="receiverName"
                maxLength={STOP_LIMITS.receiverName}
                autoComplete="off"
                className={CONTROL}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{t.receiverDni}</span>
              <input
                name="receiverDni"
                inputMode="numeric"
                maxLength={STOP_LIMITS.receiverDni}
                autoComplete="off"
                className={CONTROL}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{t.photo}</span>
              <input
                type="file"
                name="photo"
                accept="image/*"
                capture="environment"
                className="text-sm"
              />
            </label>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-medium">{t.payment}</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span>{t.amount}</span>
                <input
                  name="amount"
                  inputMode="decimal"
                  defaultValue={suggestedAmount}
                  className={CONTROL}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>{t.method}</span>
                <select name="method" defaultValue="CASH" className={CONTROL}>
                  {(Object.keys(methods) as PaymentMethod[]).map((method) => (
                    <option key={method} value={method}>
                      {methods[method]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.reason}</span>
          <textarea
            name="reason"
            required
            rows={3}
            maxLength={STOP_LIMITS.reason}
            placeholder={t.reasonPlaceholder}
            className={CONTROL}
          />
        </label>
      )}

      <p className="text-xs opacity-70">{t.location}</p>
      <FormError messages={state.error} />
      <SubmitButton pending={pending} pendingLabel={t.saving}>
        {t.save}
      </SubmitButton>
    </form>
  );
}

/**
 * Firma con el dedo (o el mouse). Se guarda en un input oculto como PNG en
 * base64; vacía, no se manda nada.
 */
function SignaturePad({
  label,
  clearLabel,
}: {
  label: string;
  clearLabel: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);

  // Resolución real del canvas = tamaño en pantalla × densidad (se ve nítida).
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = element.clientWidth * ratio;
    element.height = element.clientHeight * ratio;
    const context = element.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#000000";
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function save() {
    if (canvas.current && input.current) {
      input.current.value = canvas.current.toDataURL("image/png");
    }
  }

  function clear() {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    context.clearRect(0, 0, element.width, element.height);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      <canvas
        ref={canvas}
        aria-label={label}
        className="h-40 w-full touch-none rounded border border-current/30 bg-white"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = true;
          const context = event.currentTarget.getContext("2d");
          const { x, y } = point(event);
          context?.beginPath();
          context?.moveTo(x, y);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const context = event.currentTarget.getContext("2d");
          const { x, y } = point(event);
          context?.lineTo(x, y);
          context?.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          save();
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <input ref={input} type="hidden" name="signature" />
      <button
        type="button"
        onClick={clear}
        className="self-start text-sm hover:underline"
      >
        {clearLabel}
      </button>
    </div>
  );
}
