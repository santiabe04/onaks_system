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
 * Qué pedidos son venta y con qué fecha: entregados por fecha de entrega, o
 * todos los no cancelados por fecha del pedido.
 */
function saleFilter(basis: ReportBasis, start: Date, end: Date): Prisma.Sql {
  return basis === "delivered"
    ? Prisma.sql`s."state" IN ('DELIVERED', 'FINISHED')
        AND s."delivered_at" >= ${start} AND s."delivered_at" < ${end}`
    : Prisma.sql`s."state" <> 'CANCELED'
        AND s."created_at" >= ${start} AND s."created_at" < ${end}`;
}

/** Los ítems vendidos del período, con producto, categoría, cliente y zona. */
export async function getReportLines(
  params: ReportParams,
): Promise<ReportLine[]> {
  return db.$queryRaw<ReportLine[]>`
    SELECT s."id" AS "saleId", i."product_id" AS "productId",
           p."category_id" AS "categoryId", a."customer_id" AS "customerId",
           a."city_id" AS "cityId", i."quantity", i."unit_price" AS "unitPrice",
           i."unit_cost" AS "unitCost"
    FROM "sale_items" i
    JOIN "sales" s ON s."id" = i."sale_id"
    JOIN "products" p ON p."id" = i."product_id"
    JOIN "customer_addresses" a ON a."id" = s."address_id"
    WHERE ${saleFilter(params.basis, params.start, params.end)}`;
}

export type MonthlySales = {
  /** YYYY-MM de Argentina. */
  month: string;
  net: string;
  /** Venta con costo − costo, como en el reporte. */
  margin: string;
};

/** Venta y margen por mes (Argentina) entre `start` y `end`, para el gráfico. */
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
    SELECT to_char(${date} AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM') AS "month",
           SUM(ROUND(i."unit_price" * i."quantity", 2)) AS "net",
           COALESCE(SUM(ROUND(i."unit_price" * i."quantity", 2)
                        - ROUND(i."unit_cost" * i."quantity", 2))
                    FILTER (WHERE i."unit_cost" IS NOT NULL), 0) AS "margin"
    FROM "sale_items" i
    JOIN "sales" s ON s."id" = i."sale_id"
    WHERE ${saleFilter(basis, start, end)}
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
  /** Stock total en depósitos. */
  stock: string;
};

/** Productos a la venta (activos, no borrados) que no se vendieron en el período. */
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

/** Una fila con su nombre (y un dato secundario: SKU, provincia, etc.). */
export type LabeledRow = ReportRow & { label: string; detail: string | null };

export type SalesReport = {
  totals: ReportRow;
  /** Las filas de la pestaña elegida (vacío en "Sin movimiento"). */
  rows: LabeledRow[];
  /** Solo en "Sin movimiento". */
  idle: (IdleProduct & { category: string })[];
};

/** "Alimentos › Perros › Alimento seco" por id de categoría. */
async function categoryPaths(): Promise<Map<number, string>> {
  const rows = await db.category.findMany({
    select: { id: true, name: true, parentId: true },
  });
  return new Map(
    flattenCategoryTree(rows).map((node) => [node.id, node.path.join(" › ")]),
  );
}

/** El reporte del período para la pestaña elegida, con los nombres. */
export async function getSalesReport(
  params: ReportParams,
): Promise<SalesReport> {
  const lines = await getReportLines(params);
  const totals = reportTotals(lines);

  if (params.tab === "idle") {
    const [idle, paths] = await Promise.all([
      getIdleProducts(new Set(lines.map((line) => line.productId))),
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
