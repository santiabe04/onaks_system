import Link from "next/link";
import type { InvoiceType } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { formatters } from "@/i18n/format";
import { formatInvoiceNumber } from "@/lib/supplier-invoice";

/** A qué facturas se imputó una OP o una nota de crédito. */
export function AllocationList({
  allocations,
  t,
  format,
  links = true,
}: {
  allocations: {
    id: string;
    amount: { toString(): string };
    invoice: {
      id: string;
      type: InvoiceType;
      pointOfSale: number;
      number: number;
    };
  }[];
  t: Dictionary["supplierPayments"];
  format: ReturnType<typeof formatters>;
  /** En la impresión van sin links. */
  links?: boolean;
}) {
  if (allocations.length === 0) return null;
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full max-w-md text-left text-sm">
        <thead className="border-b border-current/30">
          <tr>
            <th className="py-2 pr-3 font-medium">{t.columns.invoice}</th>
            <th className="py-2 text-right font-medium">{t.allocated}</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((allocation) => {
            const label = formatInvoiceNumber(allocation.invoice);
            return (
              <tr key={allocation.id} className="border-b border-current/10">
                <td className="py-2 pr-3 font-mono whitespace-nowrap">
                  {links ? (
                    <Link
                      href={`/admin/invoices/${allocation.invoice.id}`}
                      className="hover:underline"
                    >
                      {label}
                    </Link>
                  ) : (
                    label
                  )}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {format.money(allocation.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
