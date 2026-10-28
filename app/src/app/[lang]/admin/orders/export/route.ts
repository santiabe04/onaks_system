import { appLocale } from "@/i18n/config";
import { getActionDictionary } from "@/i18n/dictionary";
import { formatters } from "@/i18n/format";
import { requirePermission } from "@/lib/auth";
import { toCsv, type CsvCell } from "@/lib/csv";
import { formatCuit } from "@/lib/cuit";
import { parseOrderPeriod } from "@/lib/order-period";
import { getOrdersByZone } from "@/lib/orders-by-zone-queries";

// `/admin/orders/export?week=…` o `?from=…&to=…`: los mismos pedidos que la
// pantalla (sin cancelados, por zona), uno por fila, para abrir en Excel.
export async function GET(request: Request) {
  await requirePermission("sales:read-all");
  const t = getActionDictionary();
  const locale = appLocale();
  const format = formatters(locale);
  const columns = t.adminOrders.csv;

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const period = parseOrderPeriod(params);
  const { zones } = await getOrdersByZone(period, locale);

  const rows: CsvCell[][] = [
    [
      columns.zone,
      columns.state,
      columns.number,
      columns.date,
      columns.customer,
      columns.cuit,
      columns.addressName,
      columns.address,
      columns.status,
      columns.paymentMethod,
      columns.paymentState,
      columns.weight,
      columns.volume,
      columns.net,
      columns.tax,
      columns.total,
    ],
  ];
  for (const zone of zones) {
    for (const sale of zone.orders) {
      rows.push([
        zone.cityName,
        zone.stateName,
        sale.number,
        format.dateTime(sale.createdAt),
        sale.address.customer.tradeName,
        formatCuit(sale.address.customer.cuit),
        sale.address.name,
        sale.address.address,
        t.orders.states[sale.state],
        t.orders.paymentMethods[sale.paymentMethod],
        t.orders.paymentStates[sale.paymentState],
        // Sin separador de miles: Excel los lee como número.
        format.input(sale.weight),
        format.input(sale.volume),
        format.input(sale.subTotal),
        format.input(sale.tax),
        format.input(sale.total),
      ]);
    }
  }

  const filename = `${columns.filename}-${period.from}_${period.to}.csv`;
  return new Response(toCsv(rows, locale === "es" ? ";" : ","), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
