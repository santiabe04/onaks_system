"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import {
  submitWithoutReset,
  useFieldValues,
} from "@/components/ui/use-field-values";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { COUNT_NOTES_MAX_LENGTH } from "@/lib/stock-count";
import {
  approveStockCount,
  cancelStockCount,
  createStockCount,
  scanCountEntry,
  type CountActionState,
} from "@/app/[lang]/admin/stock/counts/actions";

const CONTROL = "rounded border border-current/20 bg-transparent px-3 py-2";

/** Opens a warehouse's count. */
export function NewCountForm({
  warehouses,
  t,
}: {
  warehouses: { id: string; label: string }[];
  t: Dictionary["stockCount"];
}) {
  const [state, action, pending] = useActionState<CountActionState, FormData>(
    createStockCount,
    {},
  );
  return (
    <form action={action} className="mt-6 flex max-w-lg flex-col gap-4">
      <Field label={t.warehouse}>
        <select
          name="warehouseId"
          required
          defaultValue={warehouses.length === 1 ? warehouses[0].id : ""}
          className={CONTROL}
        >
          <option value="" disabled />
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.notes}>
        <Input name="notes" maxLength={COUNT_NOTES_MAX_LENGTH} />
      </Field>
      <FormError messages={state.error} />
      <div>
        <SubmitButton pending={pending} pendingLabel={t.opening}>
          {t.open}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Minimal BarcodeDetector (not in the TypeScript types). */
type Detector = {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;

/** The browser's barcode reader, if it has one (Chrome on Android, for example). */
function barcodeDetector(): DetectorConstructor | null {
  const Detector = (
    window as unknown as { BarcodeDetector?: DetectorConstructor }
  ).BarcodeDetector;
  return Detector && typeof navigator.mediaDevices?.getUserMedia === "function"
    ? Detector
    : null;
}

const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
];

/** Loads a scan: the code is typed, sent by a reader, or read by the camera. */
export function ScanForm({
  countId,
  t,
}: {
  countId: string;
  t: Dictionary["stockCount"];
}) {
  const [state, dispatch, pending] = useActionState<CountActionState, FormData>(
    scanCountEntry.bind(null, countId),
    {},
  );
  const fields = useFieldValues({ code: "", quantity: "1" });
  const codeRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<"off" | "on" | "unsupported">("off");

  // Once a product is loaded: the code is cleared and it starts again.
  useEffect(() => {
    if (state.added) {
      fields.setMany({ code: "", quantity: "1" });
      codeRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.added]);

  // The camera reads a code and turns off; the quantity is ready to type.
  useEffect(() => {
    if (camera !== "on") return;
    const Detector = barcodeDetector();
    if (!Detector) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const detector = new Detector({ formats: FORMATS });

    const loop = async () => {
      const video = videoRef.current;
      if (stopped || !video) return;
      try {
        const found = await detector.detect(video);
        if (found.length > 0 && !stopped) {
          fields.setMany({ code: found[0].rawValue });
          navigator.vibrate?.(60);
          setCamera("off");
          quantityRef.current?.focus();
          return;
        }
      } catch {
        // A frame that could not be read does not stop the scanning.
      }
      timer = setTimeout(loop, 250);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((media) => {
        if (stopped) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = media;
        return video.play().then(loop);
      })
      .catch(() => setCamera("unsupported"));

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  return (
    <form
      onSubmit={submitWithoutReset(dispatch)}
      className="mt-4 flex flex-col gap-3"
    >
      {camera === "on" && (
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label={t.cameraPreview}
          className="w-full rounded border border-current/20"
        />
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          {t.code}
          <input
            ref={codeRef}
            {...fields.bind("code")}
            required
            autoFocus
            autoComplete="off"
            inputMode="text"
            className={`${CONTROL} text-base`}
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-sm">
          {t.quantity}
          <input
            ref={quantityRef}
            {...fields.bind("quantity")}
            required
            inputMode="decimal"
            className={`${CONTROL} text-base`}
          />
        </label>
        <SubmitButton pending={pending} pendingLabel={t.adding}>
          {t.add}
        </SubmitButton>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          className="underline"
          onClick={() =>
            setCamera(
              camera === "on"
                ? "off"
                : barcodeDetector()
                  ? "on"
                  : "unsupported",
            )
          }
        >
          {camera === "on" ? t.stopCamera : t.useCamera}
        </button>
        {camera === "unsupported" && (
          <span className="opacity-70">{t.cameraUnsupported}</span>
        )}
      </div>
      <FormError messages={state.error} />
      {state.added && (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-400"
        >
          {interpolate(t.added, {
            name: state.added.name,
            counted: state.added.counted,
            unit: state.added.unit,
          })}
        </p>
      )}
    </form>
  );
}

/** Approves or discards the count from the review. */
export function ReviewActions({
  countId,
  hasDifferences,
  t,
}: {
  countId: string;
  hasDifferences: boolean;
  t: Dictionary["stockCount"];
}) {
  const [approved, approve, approving] = useActionState<
    CountActionState,
    FormData
  >(approveStockCount.bind(null, countId), {});
  const [canceled, cancel, canceling] = useActionState<
    CountActionState,
    FormData
  >(cancelStockCount.bind(null, countId), {});
  return (
    <div className="mt-6 flex flex-col gap-3">
      <FormError messages={approved.error ?? canceled.error} />
      <div className="flex flex-wrap items-center gap-3">
        <form
          action={approve}
          onSubmit={(event) => {
            if (hasDifferences && !window.confirm(t.approveConfirm)) {
              event.preventDefault();
            }
          }}
        >
          <SubmitButton pending={approving} pendingLabel={t.approving}>
            {t.approve}
          </SubmitButton>
        </form>
        <form
          action={cancel}
          onSubmit={(event) => {
            if (!window.confirm(t.cancelConfirm)) event.preventDefault();
          }}
        >
          <button
            type="submit"
            disabled={canceling}
            className="rounded border border-current/20 px-3 py-2 text-sm"
          >
            {canceling ? t.canceling : t.cancel}
          </button>
        </form>
      </div>
    </div>
  );
}
