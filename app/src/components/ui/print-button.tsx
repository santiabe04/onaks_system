"use client";

import { buttonClass } from "./button";

/** Opens the browser's print dialog. It does not print itself. */
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
