import "server-only";
import { db } from "./db";
import {
  addDays,
  dayOf,
  EXPIRY_WARNING_DAYS,
  expiryStatus,
  type ExpiryStatus,
} from "./lots";

export type LotRow = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  warehouseName: string;
  lotCode: string;
  /** YYYY-MM-DD. */
  expiresOn: string;
  quantity: string;
  status: ExpiryStatus;
  unit: string;
};

/** Lotes con algo de stock, del que vence antes al que vence después. */
export async function listLots(
  today: string,
  filter: { productId?: string; status?: ExpiryStatus } = {},
): Promise<LotRow[]> {
  const soonLimit = new Date(
    `${addDays(today, EXPIRY_WARNING_DAYS)}T00:00:00Z`,
  );
  const from = new Date(`${today}T00:00:00Z`);
  const lots = await db.stockLot.findMany({
    where: {
      quantity: { gt: 0 },
      productId: filter.productId,
      expiresOn:
        filter.status === "expired"
          ? { lt: from }
          : filter.status === "soon"
            ? { gte: from, lte: soonLimit }
            : filter.status === "ok"
              ? { gt: soonLimit }
              : undefined,
    },
    orderBy: [{ expiresOn: "asc" }, { lotCode: "asc" }],
    include: {
      product: {
        select: {
          name: true,
          sku: true,
          measurementUnit: { select: { name: true } },
        },
      },
      warehouse: { select: { name: true } },
    },
  });
  return lots.map((lot) => {
    const expiresOn = dayOf(lot.expiresOn);
    return {
      id: lot.id,
      productId: lot.productId,
      productName: lot.product.name,
      sku: lot.product.sku,
      warehouseName: lot.warehouse.name,
      lotCode: lot.lotCode,
      expiresOn,
      quantity: lot.quantity.toString(),
      status: expiryStatus(expiresOn, today),
      unit: lot.product.measurementUnit.name,
    };
  });
}

/** Cuántos lotes con stock están vencidos y cuántos por vencer (para el dashboard). */
export async function countExpiryAlerts(
  today: string,
): Promise<{ expired: number; soon: number }> {
  const from = new Date(`${today}T00:00:00Z`);
  const soonLimit = new Date(
    `${addDays(today, EXPIRY_WARNING_DAYS)}T00:00:00Z`,
  );
  const [expired, soon] = await Promise.all([
    db.stockLot.count({
      where: { quantity: { gt: 0 }, expiresOn: { lt: from } },
    }),
    db.stockLot.count({
      where: { quantity: { gt: 0 }, expiresOn: { gte: from, lte: soonLimit } },
    }),
  ]);
  return { expired, soon };
}

export type PickingLotRow = {
  saleId: string;
  productId: string;
  lotId: string;
  lotCode: string;
  expiresOn: string;
  quantity: string;
};

/** De qué lotes salió lo de cada pedido (neto de cambios y devoluciones). */
export async function getSaleLots(
  saleIds: string[],
  warehouseId: string,
): Promise<PickingLotRow[]> {
  if (saleIds.length === 0) return [];
  return db.$queryRaw<PickingLotRow[]>`
    SELECT m."sale_id" AS "saleId", m."product_id" AS "productId",
           l."id" AS "lotId", l."lot_code" AS "lotCode",
           to_char(l."expires_on", 'YYYY-MM-DD') AS "expiresOn",
           (-SUM(m."quantity"))::text AS "quantity"
    FROM "stock_movements" m
    JOIN "stock_lots" l ON l."id" = m."lot_id"
    WHERE m."sale_id" = ANY(${saleIds}) AND m."warehouse_id" = ${warehouseId}
      AND m."type"::text IN ('SALE', 'SALE_RETURN')
    GROUP BY m."sale_id", m."product_id", l."id", l."lot_code", l."expires_on"
    HAVING SUM(m."quantity") < 0
    ORDER BY l."expires_on", l."lot_code"`;
}

/** Lotes con stock de unos productos en un depósito (para cambiar de lote). */
export async function getWarehouseLots(
  productIds: string[],
  warehouseId: string,
): Promise<
  {
    id: string;
    productId: string;
    lotCode: string;
    expiresOn: string;
    quantity: string;
  }[]
> {
  const lots = await db.stockLot.findMany({
    where: { productId: { in: productIds }, warehouseId, quantity: { gt: 0 } },
    orderBy: [{ expiresOn: "asc" }, { lotCode: "asc" }],
  });
  return lots.map((lot) => ({
    id: lot.id,
    productId: lot.productId,
    lotCode: lot.lotCode,
    expiresOn: dayOf(lot.expiresOn),
    quantity: lot.quantity.toString(),
  }));
}
