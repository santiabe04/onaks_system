import type { ReactNode } from "react";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { formatters } from "@/i18n/format";
import { interpolate } from "@/i18n/config";
import { cartTotals, lineTotals } from "@/lib/cart";
import { finalPrice } from "@/lib/price";

// Server Component: ítems y totales de un pedido, iguales para el cliente
// ("Mis pedidos") y para el admin. Todo sale de la foto guardada al confirmar,
// no del producto actual.

type Numeric = { toString(): string };

export type OrderItem = {
  productId: string;
  quantity: Numeric;
  unitPrice: Numeric;
  unitTaxRate: Numeric;
  unitWeight: Numeric;
  product: { name: string; sku: string; measurementUnit: { name: string } };
};

export function OrderItems({
  items,
  subTotal,
  tax,
  total,
  locale,
  format,
  t,
}: {
  items: OrderItem[];
  subTotal: Numeric;
  tax: Numeric;
  total: Numeric;
  locale: string;
  format: ReturnType<typeof formatters>;
  t: Dictionary["cart"];
}) {
  const sorted = [...items].sort((a, b) =>
    a.product.name.localeCompare(b.product.name, locale),
  );
  const line = (item: OrderItem) => ({
    price: item.unitPrice,
    rate: item.unitTaxRate,
    quantity: item.quantity,
    weight: item.unitWeight,
  });
  const { weight } = cartTotals(sorted.map(line));

  return (
    <>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-current/20">
            <tr>
              <th className="py-2 pr-3 font-medium">{t.product}</th>
              <th className="py-2 pr-3 text-right font-medium">{t.quantity}</th>
              <th className="py-2 pr-3 text-right font-medium">
                {t.unitPrice}
              </th>
              <th className="py-2 text-right font-medium">{t.lineTotal}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr
                key={item.productId}
                className="border-b border-current/10 align-top"
              >
                <td className="py-2 pr-3">
                  {item.product.name}
                  <span className="block font-mono text-xs opacity-70">
                    {item.product.sku}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {format.number(item.quantity)}{" "}
                  {item.product.measurementUnit.name}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {format.money(finalPrice(item.unitPrice, item.unitTaxRate))}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {format.money(lineTotals(line(item)).total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-6 ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt className="opacity-70">{t.net}</dt>
          <dd>{format.money(subTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">{t.tax}</dt>
          <dd>{format.money(tax)}</dd>
        </div>
        <div className="flex justify-between border-t border-current/20 pt-1 text-lg font-semibold">
          <dt>{t.total}</dt>
          <dd>{format.money(total)}</dd>
        </div>
        <p className="mt-1 text-xs opacity-70">
          {interpolate(t.weight, { weight: format.number(weight) })}
        </p>
      </dl>
    </>
  );
}

/** Un dato del encabezado del pedido (fecha, entrega, pago…). */
export function OrderDetail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="opacity-70">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
