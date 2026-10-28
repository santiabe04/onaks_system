import type { NextRequest } from "next/server";
import { appLocale, interpolate } from "@/i18n/config";
import { getActionDictionary } from "@/i18n/dictionary";
import { requirePermission } from "@/lib/auth";
import { csvNumber, toCsv } from "@/lib/csv";
import { formatCuit } from "@/lib/cuit";
import { parseOrderPeriod } from "@/lib/order-period";
import { db } from "@/lib/db";
import { parseOrderFilters } from "@/lib/order-filters";
import { groupOrdersByZone, productQuantity } from "@/lib/orders-by-zone";
import { getPeriodOrders } from "@/lib/orders-by-zone-queries";

const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;

/** "2026-10-28 10:37" en hora de Argentina: lo que una planilla entiende como fecha. */
function localDateTime(date: Date): string {
  return new Date(date.getTime() + TZ_OFFSET_MS)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

// Los pedidos del período y los filtros (mismos parámetros que la pantalla) en CSV, ordenados
// por zona como en pantalla: para Excel o para cargar en otra herramienta.
export async function GET(request: NextRequest) {
  await requirePermission("sales:read-all");
  const t = getActionDictionary();
  const decimalComma = appLocale() === "es";

  // Mismo período y filtros que la pantalla (estados múltiples incluidos).
  const params: Record<string, string[]> = {};
  for (const [key, value] of request.nextUrl.searchParams) {
    (params[key] ??= []).push(value);
  }
  const period = parseOrderPeriod(params);
  const filters = parseOrderFilters(params);
  const [orders, product] = await Promise.all([
    getPeriodOrders(period, filters),
    filters.product
      ? db.product.findUnique({
          where: { id: filters.product },
          select: { name: true, measurementUnit: { select: { name: true } } },
        })
      : null,
  ]);
  const { zones } = groupOrdersByZone(orders, appLocale());

  const columns = t.adminOrders.csv;
  const rows = [
    [
      columns.number,
      columns.date,
      columns.zone,
      columns.state,
      columns.customer,
      columns.cuit,
      columns.deliveryName,
      columns.address,
      columns.zipCode,
      columns.status,
      columns.paymentMethod,
      columns.paymentState,
      // Con el filtro de producto: cuánto se pidió de él en cada pedido.
      ...(product
        ? [
            interpolate(columns.productQuantity, {
              product: product.name,
              unit: product.measurementUnit.name,
            }),
          ]
        : []),
      columns.weight,
      columns.volume,
      columns.net,
      columns.tax,
      columns.total,
      columns.notes,
    ],
    ...zones.flatMap((zone) =>
      zone.orders.map((sale) => [
        String(sale.number),
        localDateTime(sale.createdAt),
        zone.cityName,
        zone.stateName,
        sale.address.customer.tradeName,
        formatCuit(sale.address.customer.cuit),
        sale.address.name,
        sale.address.address,
        sale.address.zipCode ?? "",
        t.orders.states[sale.state],
        t.orders.paymentMethods[sale.paymentMethod],
        t.orders.paymentStates[sale.paymentState],
        ...(filters.product
          ? [csvNumber(productQuantity([sale], filters.product), decimalComma)]
          : []),
        csvNumber(sale.weight, decimalComma),
        csvNumber(sale.volume, decimalComma),
        csvNumber(sale.subTotal, decimalComma),
        csvNumber(sale.tax, decimalComma),
        csvNumber(sale.total, decimalComma),
        sale.notes ?? "",
      ]),
    ),
  ];

  const fileName = `${columns.fileName}_${period.from}_${period.to}.csv`;
  return new Response(toCsv(rows, decimalComma ? ";" : ","), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
