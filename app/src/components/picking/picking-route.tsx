import type { Dictionary } from "@/i18n/dictionaries/es";
import type { formatters } from "@/i18n/format";
import { type PickingLine, pickingRoute } from "@/lib/picking";

/**
 * El recorrido por el depósito: un renglón por producto (por ubicación), con
 * el total y de qué pedidos sale. En papel lleva una casilla para tildar.
 */
export function PickingRoute({
  lines,
  t,
  format,
  checkboxes,
}: {
  lines: PickingLine[];
  t: Dictionary["picking"];
  format: ReturnType<typeof formatters>;
  checkboxes?: boolean;
}) {
  const c = t.columns;
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-current/30">
        <tr>
          {checkboxes && <th className="w-6 py-2 pr-2" />}
          <th className="py-2 pr-3 font-medium">{c.location}</th>
          <th className="py-2 pr-3 font-medium">{c.product}</th>
          <th className="py-2 pr-3 text-right font-medium">{c.total}</th>
          <th className="py-2 font-medium">{c.orders}</th>
        </tr>
      </thead>
      <tbody>
        {pickingRoute(lines).map((stop) => (
          <tr
            key={stop.productId}
            className="border-b border-current/10 align-top"
          >
            {checkboxes && (
              <td className="py-2 pr-2 text-lg leading-none">☐</td>
            )}
            <td className="py-2 pr-3 font-mono whitespace-nowrap">
              {stop.location ?? (
                <span className="font-sans text-xs opacity-60">
                  {t.noLocation}
                </span>
              )}
            </td>
            <td className="py-2 pr-3">
              {stop.name}
              <span className="block font-mono text-xs opacity-70">
                {stop.sku}
              </span>
            </td>
            <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap">
              {format.number(stop.total)} {stop.unit}
            </td>
            <td className="py-2 text-xs">
              {stop.orders
                .map(
                  (order) =>
                    `#${order.saleNumber}: ${format.number(order.quantity)}`,
                )
                .join(" · ")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
