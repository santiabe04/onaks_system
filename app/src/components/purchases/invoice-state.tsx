import type { SupplierInvoiceState } from "@/generated/prisma/enums";

/** Estado con color: observada en ámbar, anulada en rojo. */
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
