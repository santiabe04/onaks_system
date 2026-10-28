import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit";
import { planMovement, type MovementInput, type MovementLeg } from "./stock";
import { fromMilli, toMilli } from "./quantity";

export type LedgerError =
  "productNotFound" | "warehouseInactive" | "noDifference";

/** Error esperable al registrar un movimiento; la action lo muestra en el form. */
export class StockLedgerError extends Error {
  constructor(readonly code: LedgerError) {
    super(code);
  }
}

/**
 * Bloquea el saldo de un producto en un depósito hasta el fin de la
 * transacción y lo devuelve. Si todavía no existe, lo crea en 0.
 */
async function lockBalance(
  tx: Prisma.TransactionClient,
  productId: string,
  warehouseId: string,
): Promise<string> {
  await tx.$executeRaw`
    INSERT INTO "product_stocks" ("product_id", "warehouse_id", "quantity", "updated_at")
    VALUES (${productId}, ${warehouseId}, 0, now())
    ON CONFLICT DO NOTHING`;
  const [row] = await tx.$queryRaw<{ quantity: string }[]>`
    SELECT "quantity"::text AS "quantity" FROM "product_stocks"
    WHERE "product_id" = ${productId} AND "warehouse_id" = ${warehouseId}
    FOR UPDATE`;
  return row.quantity;
}

/**
 * Registra un movimiento manual: valida producto y depósitos, bloquea los
 * saldos, calcula las patas (`planMovement`) y escribe saldo + movimiento +
 * auditoría. Todo dentro de la transacción que recibe.
 */
export async function recordMovement(
  tx: Prisma.TransactionClient,
  input: MovementInput,
  userId: string,
): Promise<MovementLeg[]> {
  const product = await tx.product.findFirst({
    where: { id: input.productId, deletedAt: null },
    select: { id: true },
  });
  if (!product) throw new StockLedgerError("productNotFound");

  const warehouseIds = [input.warehouseId, input.toWarehouseId].filter(
    (id): id is string => id !== null,
  );
  // FOR SHARE: mientras dura el movimiento nadie puede desactivar el depósito
  // (la desactivación toma el lock exclusivo de la fila para chequear el stock).
  const active = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "warehouses"
    WHERE "id" = ANY(${warehouseIds}) AND "is_active" = true
    FOR SHARE`;
  if (active.length !== warehouseIds.length) {
    throw new StockLedgerError("warehouseInactive");
  }

  // Siempre en el mismo orden: dos transferencias cruzadas no se bloquean entre sí.
  const balances = new Map<string, string>();
  for (const id of [...warehouseIds].sort()) {
    balances.set(id, await lockBalance(tx, input.productId, id));
  }

  const legs = planMovement(input, {
    from: balances.get(input.warehouseId)!,
    to: input.toWarehouseId ? balances.get(input.toWarehouseId) : undefined,
  });
  if (!legs) throw new StockLedgerError("noDifference");

  const transferId = input.type === "TRANSFER" ? randomUUID() : null;
  for (const leg of legs) {
    await tx.productStock.update({
      where: {
        productId_warehouseId: {
          productId: input.productId,
          warehouseId: leg.warehouseId,
        },
      },
      data: { quantity: leg.balanceAfter },
    });
    const movement = await tx.stockMovement.create({
      data: {
        productId: input.productId,
        warehouseId: leg.warehouseId,
        type: leg.type,
        quantity: leg.quantity,
        balanceAfter: leg.balanceAfter,
        comment: input.comment,
        transferId,
        createdById: userId,
      },
    });
    await audit(tx, {
      action: "CREATE",
      actorUserId: userId,
      entityType: "STOCK_MOVEMENT",
      entityId: movement.id,
      after: movement,
    });
  }
  return legs;
}

export type SaleStockLine = {
  productId: string;
  warehouseId: string;
  /** Variación con signo: negativa al descontar, positiva al devolver. */
  quantity: string;
};

/**
 * Descuenta (SALE) o devuelve (SALE_RETURN) el stock de un pedido: bloquea los
 * saldos en orden, escribe saldo + movimiento (con el pedido) + auditoría.
 * Los depósitos tienen que estar activos; el producto puede estar pausado o
 * borrado (el pedido ya existe). El stock puede quedar negativo.
 */
export async function recordSaleMovements(
  tx: Prisma.TransactionClient,
  sale: { id: string; number: number },
  type: "SALE" | "SALE_RETURN",
  lines: SaleStockLine[],
  userId: string,
): Promise<void> {
  if (lines.length === 0) return;

  const warehouseIds = [...new Set(lines.map((line) => line.warehouseId))];
  // FOR SHARE: igual que en recordMovement, nadie desactiva el depósito mientras tanto.
  const active = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "warehouses"
    WHERE "id" = ANY(${warehouseIds}) AND "is_active" = true
    FOR SHARE`;
  if (active.length !== warehouseIds.length) {
    throw new StockLedgerError("warehouseInactive");
  }

  // Mismo orden siempre (producto, depósito): dos pedidos no se bloquean entre sí.
  const sorted = [...lines].sort(
    (a, b) =>
      a.productId.localeCompare(b.productId) ||
      a.warehouseId.localeCompare(b.warehouseId),
  );
  for (const line of sorted) {
    const before = await lockBalance(tx, line.productId, line.warehouseId);
    const balanceAfter = fromMilli(toMilli(before) + toMilli(line.quantity));
    await tx.productStock.update({
      where: {
        productId_warehouseId: {
          productId: line.productId,
          warehouseId: line.warehouseId,
        },
      },
      data: { quantity: balanceAfter },
    });
    const movement = await tx.stockMovement.create({
      data: {
        productId: line.productId,
        warehouseId: line.warehouseId,
        type,
        quantity: line.quantity,
        balanceAfter,
        saleId: sale.id,
        comment: `#${sale.number}`,
        createdById: userId,
      },
    });
    await audit(tx, {
      action: "CREATE",
      actorUserId: userId,
      entityType: "STOCK_MOVEMENT",
      entityId: movement.id,
      after: movement,
    });
  }
}
