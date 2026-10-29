import type {
  SupplierPaymentMethod,
  WithholdingType,
} from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { formatters } from "@/i18n/format";
import { formatDay } from "./open-invoice-rows";

type Line = {
  id: string;
  method: SupplierPaymentMethod;
  amount: { toString(): string };
  reference: string | null;
  bank: string | null;
  dueDate: Date | null;
  withholdingType: WithholdingType | null;
};

/** Los medios de una OP: medio, datos (número, banco, fecha, tipo) e importe. */
export function PaymentLines({
  lines,
  total,
  t,
  format,
}: {
  lines: Line[];
  total: { toString(): string };
  t: Dictionary["supplierPayments"];
  format: ReturnType<typeof formatters>;
}) {
  const detail = (line: Line) =>
    [
      line.withholdingType && t.withholdingTypes[line.withholdingType],
      line.bank,
      line.reference && `${t.reference[line.method]} ${line.reference}`,
      line.dueDate && `${t.checkDate}: ${formatDay(format, line.dueDate)}`,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-current/30">
          <tr>
            <th className="py-2 pr-3 font-medium">{t.method}</th>
            <th className="py-2 pr-3 font-medium">{t.columns.detail}</th>
            <th className="py-2 text-right font-medium">{t.amount}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b border-current/10">
              <td className="py-2 pr-3">{t.methods[line.method]}</td>
              <td className="py-2 pr-3">{detail(line) || "—"}</td>
              <td className="py-2 text-right whitespace-nowrap">
                {format.money(line.amount)}
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-2 pr-3" colSpan={2}>
              {t.total}
            </td>
            <td className="py-2 text-right whitespace-nowrap">
              {format.money(total)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
