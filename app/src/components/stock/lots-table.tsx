import Link from "next/link";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { formatters } from "@/i18n/format";
import type { LotRow } from "@/lib/lots-queries";

const BADGE = {
  expired: "bg-red-500/20 text-red-700 dark:text-red-300",
  soon: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  ok: "",
} as const;

/** Lotes con stock, con su vencimiento y si ya vencieron o están por vencer. */
export function LotsTable({
  lots,
  format,
  t,
  showProduct,
}: {
  lots: LotRow[];
  format: ReturnType<typeof formatters>;
  t: Dictionary["lots"];
  showProduct: boolean;
}) {
  if (lots.length === 0) {
    return <p className="mt-4 text-sm opacity-70">{t.empty}</p>;
  }
  return (
    <div className="mt-4 overflow-x-auto print:overflow-visible">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-current/20">
          <tr>
            {showProduct && (
              <th className="py-2 pr-3 font-medium">{t.product}</th>
            )}
            <th className="py-2 pr-3 font-medium">{t.warehouse}</th>
            <th className="py-2 pr-3 font-medium">{t.lot}</th>
            <th className="py-2 pr-3 font-medium">{t.expiresOn}</th>
            <th className="py-2 pr-3 font-medium">{t.state}</th>
            <th className="py-2 text-right font-medium">{t.quantity}</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => (
            <tr key={lot.id} className="border-b border-current/10">
              {showProduct && (
                <td className="py-2 pr-3">
                  <Link
                    href={`/admin/stock/${lot.productId}`}
                    className="hover:underline"
                  >
                    {lot.productName}
                  </Link>
                  <span className="block font-mono text-xs opacity-70">
                    {lot.sku}
                  </span>
                </td>
              )}
              <td className="py-2 pr-3">{lot.warehouseName}</td>
              <td className="py-2 pr-3 font-mono">{lot.lotCode}</td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {format.day(lot.expiresOn)}
              </td>
              <td className="py-2 pr-3">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${BADGE[lot.status]}`}
                >
                  {t.states[lot.status]}
                </span>
              </td>
              <td className="py-2 text-right font-mono whitespace-nowrap">
                {format.number(lot.quantity)} {lot.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
