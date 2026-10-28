"use client";

import { buttonClass } from "./button";

/** Abre el diálogo de impresión del navegador; no aparece en lo impreso. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`${buttonClass("secondary")} print:hidden`}
    >
      {label}
    </button>
  );
}
