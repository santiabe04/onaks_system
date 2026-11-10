import type { SupplierInvoiceState } from "@/generated/prisma/enums";

/** Status with color: flagged in amber, voided in red. */
export function InvoiceState({
  state,
  label,
}: {
  state: SupplierInvoiceState;
  label: Record<SupplierInvoiceState, string>;
}) {
  const color =
    state === "FLAGGED"
      ? "text-amber-700 dark:text-amber-400"
      : state === "ANNULLED"
        ? "text-red-600"
        : "";
  return <span className={color}>{label[state]}</span>;
}
