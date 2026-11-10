import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { flattenCategoryTree } from "./category";
import { db } from "./db";
import {
  reportTotals,
  summarizeBy,
  type ReportBasis,
  type ReportLine,
  type ReportParams,
  type ReportRow,
} from "./sales-report";

/**
 * Which orders are sales and with what date: delivered by delivery date, or
 * all non-canceled ones by order date.
 */
function saleFilter(basis: ReportBasis, start: Date, end: Date): Prisma.Sql {
  return basis === "delivered"
    ? Prisma.sql`s."state" IN ('DELIVERED', 'FINISHED')
        AND s."delivered_at" >= ${start} AND s."delivered_at" < ${end}`
    : Prisma.sql`s."state" <> 'CANCELED'
        AND s."created_at" >= ${start} AND s."created_at" < ${end}`;
}

/**
 * The valid returns of a period: the non-voided credit notes of type
 * return, by the note's date (not the order's), so that
 * months already closed do not move.
 */
function returnFilter(start: Date, end: Date): Prisma.Sql {
  return Prisma.sql`n."kind" = 'RETURN' AND n."voided_at" IS NULL
        AND n."created_at" >= ${start} AND n."created_at" < ${end}`;
}

/**
 * The items sold in the period and the returned ones (with the price and cost of the
 * original order), with product, category, customer and zone.
 */
export async function getReportLines(
  params: ReportParams,
): Promise<ReportLine[]> {
  return db.$queryRaw<ReportLine[]>`
    SELECT 'sale' AS "kind", NULL AS "destination",
           s."id" AS "saleId", i."product_id" AS "productId",
           p."category_id" AS "categoryId", a."customer_id" AS "customerId",
           a."city_id" AS "cityId", i."quantity", i."unit_price" AS "unitPrice",
           i."unit_cost" AS "unitCost"
    FROM "sale_items" i
    JOIN "sales" s ON s."id" = i."sale_id"
    JOIN "products" p ON p."id" = i."product_id"
    JOIN "customer_addresses" a ON a."id" = s."address_id"
    WHERE ${saleFilter(params.basis, params.start, params.end)}
    UNION ALL
    SELECT 'return', ci."destination"::text,
           n."sale_id", ci."product_id", p."category_id", a."customer_id",
           a."city_id", ci."quantity", ci."unit_price", ci."unit_cost"
    FROM "customer_credit_note_items" ci
    JOIN "customer_credit_notes" n ON n."id" = ci."credit_note_id"
    JOIN "sales" s ON s."id" = n."sale_id"
    JOIN "products" p ON p."id" = ci."product_id"
    JOIN "customer_addresses" a ON a."id" = s."address_id"
    WHERE ${returnFilter(params.start, params.end)}`;
}

export type MonthlySales = {
  /** YYYY-MM in Argentina. */
  month: string;
  net: string;
  /** Sale with cost − cost, as in the report. */
  margin: string;
};

/**
 * Sale and margin per month (Argentina) between `start` and `end`, for the chart,
 * net of returns with the same rule as the report: what goes back to
 * stock reverses sale and cost; what is written off, only the sale.
 */
export async function getMonthlySales(
  basis: ReportBasis,
  start: Date,
  end: Date,
): Promise<MonthlySales[]> {
  const date =
    basis === "delivered"
      ? Prisma.sql`s."delivered_at"`
      : Prisma.sql`s."created_at"`;
  const rows = await db.$queryRaw<
    { month: string; net: Prisma.Decimal; margin: Prisma.Decimal }[]
  >`
    WITH "movements" AS (
      SELECT ${date} AS "at",
             ROUND(i."unit_price" * i."quantity", 2) AS "net",
             ROUND(i."unit_price" * i."quantity", 2)
               - ROUND(i."unit_cost" * i."quantity", 2) AS "margin"
      FROM "sale_items" i
      JOIN "sales" s ON s."id" = i."sale_id"
      WHERE ${saleFilter(basis, start, end)}
      UNION ALL
      SELECT n."created_at",
             -ROUND(ci."unit_price" * ci."quantity", 2),
             CASE WHEN ci."unit_cost" IS NULL THEN NULL
                  WHEN ci."destination" = 'RESTOCK'
                    THEN -(ROUND(ci."unit_price" * ci."quantity", 2)
                           - ROUND(ci."unit_cost" * ci."quantity", 2))
                  ELSE -ROUND(ci."unit_price" * ci."quantity", 2) END
      FROM "customer_credit_note_items" ci
      JOIN "customer_credit_notes" n ON n."id" = ci."credit_note_id"
      WHERE ${returnFilter(start, end)}
    )
    SELECT to_char("at" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM') AS "month",
           SUM("net") AS "net",
           COALESCE(SUM("margin") FILTER (WHERE "margin" IS NOT NULL), 0) AS "margin"
    FROM "movements"
    GROUP BY 1`;
  return rows.map((row) => ({
    month: row.month,
    net: row.net.toString(),
    margin: row.margin.toString(),
  }));
}

export type IdleProduct = {
  id: string;
  name: string;
  sku: string;
  categoryId: number;
  unit: string;
  /** Total stock in warehouses. */
  stock: string;
};

/** Products on sale (active, not deleted) that did not sell in the period. */
export async function getIdleProducts(
  soldIds: Set<string>,
): Promise<IdleProduct[]> {
  const products = await db.product.findMany({
    where: { deletedAt: null, isActive: true, id: { notIn: [...soldIds] } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sku: true,
      categoryId: true,
      measurementUnit: { select: { name: true } },
      stocks: { select: { quantity: true } },
    },
  });
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    categoryId: product.categoryId,
    unit: product.measurementUnit.name,
    stock: product.stocks
      .reduce((sum, row) => sum.plus(row.quantity), new Prisma.Decimal(0))
      .toString(),
  }));
}

/** A row with its name (and a secondary detail: SKU, province, etc.). */
export type LabeledRow = ReportRow & { label: string; detail: string | null };

export type SalesReport = {
  totals: ReportRow;
  /** The rows of the chosen tab (empty in "No movement"). */
  rows: LabeledRow[];
  /** Only in "No movement". */
  idle: (IdleProduct & { category: string })[];
};

/** "Alimentos › Perros › Alimento seco" by category id. */
async function categoryPaths(): Promise<Map<number, string>> {
  const rows = await db.category.findMany({
    select: { id: true, name: true, parentId: true },
  });
  return new Map(
    flattenCategoryTree(rows).map((node) => [node.id, node.path.join(" › ")]),
  );
}

/** The period's report for the chosen tab, with the names. */
export async function getSalesReport(
  params: ReportParams,
): Promise<SalesReport> {
  const lines = await getReportLines(params);
  const totals = reportTotals(lines);

  if (params.tab === "idle") {
    const [idle, paths] = await Promise.all([
      // No movement = did not sell: a return alone does not count.
      getIdleProducts(
        new Set(
          lines
            .filter((line) => line.kind === "sale")
            .map((line) => line.productId),
        ),
      ),
      categoryPaths(),
    ]);
    return {
      totals,
      rows: [],
      idle: idle.map((product) => ({
        ...product,
        category: paths.get(product.categoryId) ?? "",
      })),
    };
  }

  const label = (
    rows: ReportRow[],
    names: Map<string, { label: string; detail: string | null }>,
  ): LabeledRow[] =>
    rows.map((row) => ({
      ...row,
      ...(names.get(row.key) ?? { label: row.key, detail: null }),
    }));

  if (params.tab === "products") {
    const rows = summarizeBy(lines, (line) => line.productId);
    const products = await db.product.findMany({
      where: { id: { in: rows.map((row) => row.key) } },
      select: {
        id: true,
        name: true,
        sku: true,
        measurementUnit: { select: { name: true } },
      },
    });
    return {
      totals,
      idle: [],
      rows: label(
        rows,
        new Map(
          products.map((product) => [
            product.id,
            {
              label: product.name,
              detail: `${product.sku} · ${product.measurementUnit.name}`,
            },
          ]),
        ),
      ),
    };
  }

  if (params.tab === "categories") {
    const rows = summarizeBy(lines, (line) => String(line.categoryId));
    const paths = await categoryPaths();
    return {
      totals,
      idle: [],
      rows: label(
        rows,
        new Map(
          rows.map((row) => [
            row.key,
            { label: paths.get(Number(row.key)) ?? row.key, detail: null },
          ]),
        ),
      ),
    };
  }

  if (params.tab === "customers") {
    const rows = summarizeBy(lines, (line) => line.customerId);
    const customers = await db.customer.findMany({
      where: { id: { in: rows.map((row) => row.key) } },
      select: { id: true, tradeName: true, legalName: true },
    });
    return {
      totals,
      idle: [],
      rows: label(
        rows,
        new Map(
          customers.map((customer) => [
            customer.id,
            { label: customer.tradeName, detail: customer.legalName },
          ]),
        ),
      ),
    };
  }

  const rows = summarizeBy(lines, (line) => String(line.cityId));
  const cities = await db.city.findMany({
    where: { id: { in: rows.map((row) => Number(row.key)) } },
    select: { id: true, name: true, state: { select: { name: true } } },
  });
  return {
    totals,
    idle: [],
    rows: label(
      rows,
      new Map(
        cities.map((city) => [
          String(city.id),
          { label: city.name, detail: city.state.name },
        ]),
      ),
    ),
  };
}
