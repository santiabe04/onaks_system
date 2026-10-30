import type { NextRequest } from "next/server";
import { appLocale } from "@/i18n/config";
import { getActionDictionary } from "@/i18n/dictionary";
import { requirePermission } from "@/lib/auth";
import { csvNumber, toCsv } from "@/lib/csv";
import { parseReportParams } from "@/lib/sales-report";
import { getSalesReport } from "@/lib/sales-report-queries";

// La pestaña del reporte (mismos parámetros que la pantalla) en CSV, para
// Excel. El margen % va como fracción con 4 decimales (0,2500 = 25 %).
export async function GET(request: NextRequest) {
  await requirePermission("reports:read");
  const t = getActionDictionary().salesReport;
  const decimalComma = appLocale() === "es";
  const number = (value: { toString(): string }) =>
    csvNumber(value, decimalComma);

  const params = parseReportParams(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  const report = await getSalesReport(params);
  const c = t.columns;

  const rows =
    params.tab === "idle"
      ? [
          [c.product, "SKU", c.category, c.stock],
          ...report.idle.map((product) => [
            product.name,
            product.sku,
            product.category,
            number(product.stock),
          ]),
        ]
      : [
          [
            {
              products: c.product,
              categories: c.category,
              customers: c.customer,
              zones: c.zone,
            }[params.tab],
            "",
            c.quantity,
            c.orders,
            c.net,
            c.cost,
            c.margin,
            c.marginRate,
          ],
          ...report.rows.map((row) => [
            row.label,
            row.detail ?? "",
            params.tab === "products" ? number(row.quantity) : "",
            String(row.orders),
            number(row.net),
            number(row.cost),
            number(row.margin),
            row.marginRate === null ? "" : number(row.marginRate.toFixed(4)),
          ]),
        ];

  const fileName = `${t.fileName}_${params.tab}_${params.from}_${params.to}.csv`;
  return new Response(toCsv(rows, decimalComma ? ";" : ","), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
