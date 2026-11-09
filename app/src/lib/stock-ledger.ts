import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit";
import { planMovement, type MovementInput, type MovementLeg } from "./stock";
import { fromMilli, toMilli } from "./quantity";
import {
  allocateFefo,
  returnToLots,
  type LotBalance,
  type LotTake,
} from "./lots";

export type LedgerError =
  | "productNotFound"
  | "warehouseInactive"
  | "noDifference"
  | "lotRequired"
  | "lotInvalid";

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

// --- Lotes -----------------------------------------------------------------
// Solo los productos que controlan vencimiento (`tracks_expiry`) llevan lotes.
// Una salida toma primero del lote que vence antes (FEFO) y lo que los lotes no
// cubren sale del stock sin lote; cada tramo es un movimiento con su `lot_id`.

/** Un tramo de un movimiento: de qué lote (null = sin lote) y cuánto, con signo. */
type Part = { lotId: string | null; quantity: bigint };
/** Lote y vencimiento (YYYY-MM-DD) de lo que se recibe o se revierte. */
export type LotKey = { code: string; expiresOn: string };

const day = (value: string) => new Date(`${value}T00:00:00Z`);

async function trackedProducts(
  tx: Prisma.TransactionClient,
  productIds: string[],
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const rows = await tx.product.findMany({
    where: { id: { in: productIds }, tracksExpiry: true },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

/** Los lotes de un producto en un depósito, bloqueados (siempre en el mismo orden). */
async function lockLots(
  tx: Prisma.TransactionClient,
  productId: string,
  warehouseId: string,
): Promise<LotBalance[]> {
  return tx.$queryRaw<LotBalance[]>`
    SELECT "id", "lot_code" AS "lotCode",
           to_char("expires_on", 'YYYY-MM-DD') AS "expiresOn",
           "quantity"::text AS "quantity"
    FROM "stock_lots"
    WHERE "product_id" = ${productId} AND "warehouse_id" = ${warehouseId}
    ORDER BY "id" FOR UPDATE`;
}

async function upsertLot(
  tx: Prisma.TransactionClient,
  productId: string,
  warehouseId: string,
  key: LotKey,
): Promise<string> {
  const lot = await tx.stockLot.upsert({
    where: {
      productId_warehouseId_lotCode_expiresOn: {
        productId,
        warehouseId,
        lotCode: key.code,
        expiresOn: day(key.expiresOn),
      },
    },
    create: {
      productId,
      warehouseId,
      lotCode: key.code,
      expiresOn: day(key.expiresOn),
    },
    update: {},
    select: { id: true },
  });
  return lot.id;
}

async function shiftLot(
  tx: Prisma.TransactionClient,
  lotId: string,
  delta: bigint,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "stock_lots"
    SET "quantity" = "quantity" + ${fromMilli(delta)}::numeric, "updated_at" = now()
    WHERE "id" = ${lotId}`;
}

/** Salida de `amount` (positivo): primero lo que vence antes, el resto sin lote. */
async function takeParts(
  tx: Prisma.TransactionClient,
  productId: string,
  warehouseId: string,
  amount: bigint,
): Promise<Part[]> {
  const lots = await lockLots(tx, productId, warehouseId);
  const { takes, rest } = allocateFefo(lots, fromMilli(amount));
  const parts: Part[] = takes.map((take) => ({
    lotId: take.lotId,
    quantity: -toMilli(take.quantity),
  }));
  if (toMilli(rest) > BigInt(0)) {
    parts.push({ lotId: null, quantity: -toMilli(rest) });
  }
  return parts;
}

/** Vuelve a los lotes de donde el pedido sacó la mercadería (lo demás, sin lote). */
async function saleReturnParts(
  tx: Prisma.TransactionClient,
  saleId: string,
  productId: string,
  warehouseId: string,
  amount: bigint,
): Promise<Part[]> {
  const taken = await tx.$queryRaw<LotTake[]>`
    SELECT "lot_id" AS "lotId", (-SUM("quantity"))::text AS "quantity"
    FROM "stock_movements"
    WHERE "sale_id" = ${saleId} AND "product_id" = ${productId}
      AND "warehouse_id" = ${warehouseId} AND "lot_id" IS NOT NULL
      AND "type"::text IN ('SALE', 'SALE_RETURN')
    GROUP BY "lot_id" HAVING SUM("quantity") < 0
    ORDER BY "lot_id"`;
  const { puts, rest } = returnToLots(taken, fromMilli(amount));
  const parts: Part[] = puts.map((put) => ({
    lotId: put.lotId,
    quantity: toMilli(put.quantity),
  }));
  if (toMilli(rest) > BigInt(0)) {
    parts.push({ lotId: null, quantity: toMilli(rest) });
  }
  return parts;
}

/**
 * Una devolución de un cliente vuelve a los lotes de donde salió el pedido,
 * descontando lo que otras notas del mismo pedido ya devolvieron (lo demás,
 * sin lote).
 */
async function noteReturnParts(
  tx: Prisma.TransactionClient,
  saleId: string,
  productId: string,
  warehouseId: string,
  amount: bigint,
): Promise<Part[]> {
  const [taken, returned] = await Promise.all([
    tx.$queryRaw<LotTake[]>`
      SELECT "lot_id" AS "lotId", (-SUM("quantity"))::text AS "quantity"
      FROM "stock_movements"
      WHERE "sale_id" = ${saleId} AND "product_id" = ${productId}
        AND "warehouse_id" = ${warehouseId} AND "lot_id" IS NOT NULL
        AND "type"::text IN ('SALE', 'SALE_RETURN')
      GROUP BY "lot_id" HAVING SUM("quantity") < 0
      ORDER BY "lot_id"`,
    tx.$queryRaw<LotTake[]>`
      SELECT m."lot_id" AS "lotId", SUM(m."quantity")::text AS "quantity"
      FROM "stock_movements" m
      JOIN "customer_credit_notes" n ON n."id" = m."customer_credit_note_id"
      WHERE n."sale_id" = ${saleId} AND m."product_id" = ${productId}
        AND m."warehouse_id" = ${warehouseId} AND m."lot_id" IS NOT NULL
        AND m."type"::text IN ('CUSTOMER_RETURN', 'CUSTOMER_RETURN_REVERSAL')
      GROUP BY m."lot_id"`,
  ]);
  const back = new Map(
    returned.map((row) => [row.lotId, toMilli(row.quantity)]),
  );
  const outstanding = taken
    .map((row) => ({
      lotId: row.lotId,
      quantity: fromMilli(
        toMilli(row.quantity) - (back.get(row.lotId) ?? BigInt(0)),
      ),
    }))
    .filter((row) => toMilli(row.quantity) > BigInt(0));
  const { puts, rest } = returnToLots(outstanding, fromMilli(amount));
  const parts: Part[] = puts.map((put) => ({
    lotId: put.lotId,
    quantity: toMilli(put.quantity),
  }));
  if (toMilli(rest) > BigInt(0)) {
    parts.push({ lotId: null, quantity: toMilli(rest) });
  }
  return parts;
}

/**
 * Saca de los lotes donde esa nota dejó mercadería (dar de baja lo devuelto o
 * anular la devolución); lo que no tenga lote sale del stock sin lote.
 */
async function noteHeldParts(
  tx: Prisma.TransactionClient,
  noteId: string,
  productId: string,
  warehouseId: string,
  amount: bigint,
): Promise<Part[]> {
  const held = await tx.$queryRaw<LotTake[]>`
    SELECT "lot_id" AS "lotId", SUM("quantity")::text AS "quantity"
    FROM "stock_movements"
    WHERE "customer_credit_note_id" = ${noteId} AND "product_id" = ${productId}
      AND "warehouse_id" = ${warehouseId} AND "lot_id" IS NOT NULL
    GROUP BY "lot_id" HAVING SUM("quantity") > 0
    ORDER BY "lot_id"`;
  const { puts, rest } = returnToLots(held, fromMilli(amount));
  const parts: Part[] = puts.map((put) => ({
    lotId: put.lotId,
    quantity: -toMilli(put.quantity),
  }));
  if (toMilli(rest) > BigInt(0)) {
    parts.push({ lotId: null, quantity: -toMilli(rest) });
  }
  return parts;
}

/** Revierte un ingreso: saca del lote que se recibió (lo que ya no esté, del stock sin lote). */
async function reversalParts(
  tx: Prisma.TransactionClient,
  productId: string,
  warehouseId: string,
  key: LotKey,
  amount: bigint,
): Promise<Part[]> {
  const lots = await lockLots(tx, productId, warehouseId);
  const lot = lots.find(
    (row) => row.lotCode === key.code && row.expiresOn === key.expiresOn,
  );
  if (!lot) return [{ lotId: null, quantity: -amount }];
  const available = toMilli(lot.quantity);
  const take = available < amount ? available : amount;
  const parts: Part[] = [];
  if (take > BigInt(0)) parts.push({ lotId: lot.id, quantity: -take });
  if (amount > take) parts.push({ lotId: null, quantity: -(amount - take) });
  return parts;
}

/**
 * Escribe los tramos de un movimiento sobre un saldo ya bloqueado: lotes,
 * movimientos con saldo corrido, auditoría y el saldo final del producto.
 */
async function writeParts(
  tx: Prisma.TransactionClient,
  target: {
    productId: string;
    warehouseId: string;
    before: string;
    parts: Part[];
    userId: string;
    data: Omit<
      Prisma.StockMovementUncheckedCreateInput,
      | "productId"
      | "warehouseId"
      | "quantity"
      | "balanceAfter"
      | "lotId"
      | "createdById"
    >;
  },
): Promise<void> {
  // Un tramo en cero sobra, salvo que sea el único (el movimiento existe igual).
  const parts =
    target.parts.length > 1
      ? target.parts.filter((part) => part.quantity !== BigInt(0))
      : target.parts;
  let running = toMilli(target.before);
  for (const part of parts) {
    running += part.quantity;
    if (part.lotId) await shiftLot(tx, part.lotId, part.quantity);
    const movement = await tx.stockMovement.create({
      data: {
        ...target.data,
        productId: target.productId,
        warehouseId: target.warehouseId,
        quantity: fromMilli(part.quantity),
        balanceAfter: fromMilli(running),
        lotId: part.lotId,
        createdById: target.userId,
      },
    });
    await audit(tx, {
      action: "CREATE",
      actorUserId: target.userId,
      entityType: "STOCK_MOVEMENT",
      entityId: movement.id,
      after: movement,
    });
  }
  await tx.productStock.update({
    where: {
      productId_warehouseId: {
        productId: target.productId,
        warehouseId: target.warehouseId,
      },
    },
    data: { quantity: fromMilli(running) },
  });
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
  const tracked = (await trackedProducts(tx, [input.productId])).size > 0;
  // Lo que salió de cada lote en una transferencia llega al mismo lote del destino.
  let moved: { key: LotKey; quantity: bigint }[] = [];
  for (const leg of legs) {
    const delta = toMilli(leg.quantity);
    let parts: Part[] = [{ lotId: null, quantity: delta }];
    if (tracked && leg.type === "ENTRY") {
      // Un ingreso a mano de un producto con vencimiento dice de qué lote es.
      if (!input.lot) throw new StockLedgerError("lotRequired");
      const lotId = await upsertLot(
        tx,
        input.productId,
        leg.warehouseId,
        input.lot,
      );
      parts = [{ lotId, quantity: delta }];
    } else if (tracked && delta < BigInt(0)) {
      parts = await takeParts(tx, input.productId, leg.warehouseId, -delta);
      if (leg.type === "TRANSFER_OUT") {
        const lots = await lockLots(tx, input.productId, leg.warehouseId);
        moved = parts.flatMap((part) => {
          const lot = lots.find((row) => row.id === part.lotId);
          return lot
            ? [
                {
                  key: { code: lot.lotCode, expiresOn: lot.expiresOn },
                  quantity: -part.quantity,
                },
              ]
            : [];
        });
      }
    } else if (tracked && leg.type === "TRANSFER_IN") {
      parts = [];
      let left = delta;
      for (const row of moved) {
        const lotId = await upsertLot(
          tx,
          input.productId,
          leg.warehouseId,
          row.key,
        );
        parts.push({ lotId, quantity: row.quantity });
        left -= row.quantity;
      }
      if (left > BigInt(0) || parts.length === 0) {
        parts.push({ lotId: null, quantity: left });
      }
    }
    await writeParts(tx, {
      productId: input.productId,
      warehouseId: leg.warehouseId,
      before: fromMilli(toMilli(leg.balanceAfter) - delta),
      parts,
      userId,
      data: { type: leg.type, comment: input.comment, transferId },
    });
  }
  return legs;
}

/**
 * Saca del saldo lo que no estaba (ajuste por inventario de una diferencia,
 * no de un conteo): bloquea el saldo y escribe saldo + movimiento ADJUSTMENT
 * negativo + auditoría. El depósito tiene que estar activo.
 */
export async function recordStockCorrection(
  tx: Prisma.TransactionClient,
  line: { productId: string; warehouseId: string; missing: string },
  comment: string,
  userId: string,
): Promise<void> {
  const active = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "warehouses"
    WHERE "id" = ${line.warehouseId} AND "is_active" = true
    FOR SHARE`;
  if (active.length === 0) throw new StockLedgerError("warehouseInactive");
  const before = await lockBalance(tx, line.productId, line.warehouseId);
  const delta = -toMilli(line.missing);
  const tracked = (await trackedProducts(tx, [line.productId])).size > 0;
  await writeParts(tx, {
    productId: line.productId,
    warehouseId: line.warehouseId,
    before,
    parts:
      tracked && delta < BigInt(0)
        ? await takeParts(tx, line.productId, line.warehouseId, -delta)
        : [{ lotId: null, quantity: delta }],
    userId,
    data: { type: "ADJUSTMENT", comment },
  });
}

export type LinkedStockLine = {
  productId: string;
  warehouseId: string;
  /** Variación con signo: negativa al descontar, positiva al ingresar. */
  quantity: string;
  /** Lote y vencimiento de lo que ingresa o se revierte en una recepción. */
  lot?: LotKey;
};

/** El documento que mueve el stock: un pedido, un informe de recepción o una devolución. */
type MovementLink =
  | { type: "SALE" | "SALE_RETURN"; saleId: string; comment: string }
  | {
      type: "PURCHASE_RECEIPT" | "PURCHASE_RECEIPT_REVERSAL";
      goodsReceiptId: string;
      comment: string;
    }
  | {
      type: "CUSTOMER_RETURN" | "CUSTOMER_RETURN_REVERSAL" | "WRITE_OFF";
      customerCreditNoteId: string;
      /** El pedido de la nota: de sus lotes salió lo que se devuelve. */
      noteSaleId: string | null;
      comment: string;
    };

/**
 * Mueve el stock de un documento: bloquea los saldos en orden, escribe saldo
 * + movimiento (con el documento) + auditoría. Los depósitos tienen que estar
 * activos; el producto puede estar pausado o borrado (el documento ya existe).
 * El stock puede quedar negativo.
 */
async function recordLinkedMovements(
  tx: Prisma.TransactionClient,
  link: MovementLink,
  lines: LinkedStockLine[],
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

  // Mismo orden siempre (producto, depósito): dos documentos no se bloquean entre sí.
  const sorted = [...lines].sort(
    (a, b) =>
      a.productId.localeCompare(b.productId) ||
      a.warehouseId.localeCompare(b.warehouseId),
  );
  const tracked = await trackedProducts(tx, [
    ...new Set(sorted.map((line) => line.productId)),
  ]);
  for (const line of sorted) {
    const before = await lockBalance(tx, line.productId, line.warehouseId);
    const delta = toMilli(line.quantity);
    let parts: Part[] = [{ lotId: null, quantity: delta }];
    if (tracked.has(line.productId)) {
      if (link.type === "PURCHASE_RECEIPT" && line.lot) {
        const lotId = await upsertLot(
          tx,
          line.productId,
          line.warehouseId,
          line.lot,
        );
        parts = [{ lotId, quantity: delta }];
      } else if (link.type === "PURCHASE_RECEIPT_REVERSAL" && line.lot) {
        parts = await reversalParts(
          tx,
          line.productId,
          line.warehouseId,
          line.lot,
          -delta,
        );
      } else if (link.type === "SALE" && delta < BigInt(0)) {
        parts = await takeParts(tx, line.productId, line.warehouseId, -delta);
      } else if (
        "customerCreditNoteId" in link &&
        link.type === "CUSTOMER_RETURN" &&
        link.noteSaleId &&
        delta > BigInt(0)
      ) {
        parts = await noteReturnParts(
          tx,
          link.noteSaleId,
          line.productId,
          line.warehouseId,
          delta,
        );
      } else if (
        "customerCreditNoteId" in link &&
        link.type !== "CUSTOMER_RETURN" &&
        delta < BigInt(0)
      ) {
        parts = await noteHeldParts(
          tx,
          link.customerCreditNoteId,
          line.productId,
          line.warehouseId,
          -delta,
        );
      } else if (
        link.type === "SALE_RETURN" &&
        "saleId" in link &&
        delta > BigInt(0)
      ) {
        parts = await saleReturnParts(
          tx,
          link.saleId,
          line.productId,
          line.warehouseId,
          delta,
        );
      }
    }
    await writeParts(tx, {
      productId: line.productId,
      warehouseId: line.warehouseId,
      before,
      parts,
      userId,
      data: {
        type: link.type,
        saleId: "saleId" in link ? link.saleId : null,
        goodsReceiptId: "goodsReceiptId" in link ? link.goodsReceiptId : null,
        customerCreditNoteId:
          "customerCreditNoteId" in link ? link.customerCreditNoteId : null,
        comment: link.comment,
      },
    });
  }
}

/** Descuenta (SALE) o devuelve (SALE_RETURN) el stock de un pedido. */
export async function recordSaleMovements(
  tx: Prisma.TransactionClient,
  sale: { id: string; number: number },
  type: "SALE" | "SALE_RETURN",
  lines: LinkedStockLine[],
  userId: string,
): Promise<void> {
  await recordLinkedMovements(
    tx,
    { type, saleId: sale.id, comment: `#${sale.number}` },
    lines,
    userId,
  );
}

/**
 * Ingresa (PURCHASE_RECEIPT, cantidades positivas) o revierte
 * (PURCHASE_RECEIPT_REVERSAL, negativas) lo de un informe de recepción.
 */
export async function recordReceiptMovements(
  tx: Prisma.TransactionClient,
  receipt: { id: string; number: number; orderNumber: number },
  type: "PURCHASE_RECEIPT" | "PURCHASE_RECEIPT_REVERSAL",
  lines: LinkedStockLine[],
  userId: string,
): Promise<void> {
  await recordLinkedMovements(
    tx,
    {
      type,
      goodsReceiptId: receipt.id,
      comment: `IR #${receipt.number} · OC #${receipt.orderNumber}`,
    },
    lines,
    userId,
  );
}

/**
 * Mueve el stock de una devolución de un cliente: ingresa lo devuelto
 * (CUSTOMER_RETURN, positivas), lo da de baja (WRITE_OFF, negativas) o revierte
 * el ingreso al anularla (CUSTOMER_RETURN_REVERSAL, negativas).
 */
export async function recordCreditNoteMovements(
  tx: Prisma.TransactionClient,
  note: { id: string; number: number; saleId: string | null },
  type: "CUSTOMER_RETURN" | "CUSTOMER_RETURN_REVERSAL" | "WRITE_OFF",
  lines: LinkedStockLine[],
  userId: string,
): Promise<void> {
  await recordLinkedMovements(
    tx,
    {
      type,
      customerCreditNoteId: note.id,
      noteSaleId: note.saleId,
      comment: `NC #${note.number}`,
    },
    lines,
    userId,
  );
}

/**
 * Cambia de qué lote sale lo que un pedido ya descontó: devuelve `quantity` al
 * lote de origen y la saca del de destino, dos movimientos del pedido (el
 * saldo del producto no cambia). El origen tiene que seguir teniendo al menos
 * esa cantidad tomada por el pedido y el destino alcanzarla.
 */
export async function reassignSaleLot(
  tx: Prisma.TransactionClient,
  sale: { id: string; number: number },
  change: {
    productId: string;
    warehouseId: string;
    fromLotId: string;
    toLotId: string;
    quantity: string;
  },
  userId: string,
): Promise<void> {
  const amount = toMilli(change.quantity);
  if (amount <= BigInt(0) || change.fromLotId === change.toLotId) {
    throw new StockLedgerError("lotInvalid");
  }
  const before = await lockBalance(tx, change.productId, change.warehouseId);
  const lots = await lockLots(tx, change.productId, change.warehouseId);
  const from = lots.find((lot) => lot.id === change.fromLotId);
  const to = lots.find((lot) => lot.id === change.toLotId);
  if (!from || !to || toMilli(to.quantity) < amount) {
    throw new StockLedgerError("lotInvalid");
  }
  const [taken] = await tx.$queryRaw<{ quantity: string }[]>`
    SELECT COALESCE(-SUM("quantity"), 0)::text AS "quantity"
    FROM "stock_movements"
    WHERE "sale_id" = ${sale.id} AND "product_id" = ${change.productId}
      AND "warehouse_id" = ${change.warehouseId} AND "lot_id" = ${from.id}
      AND "type"::text IN ('SALE', 'SALE_RETURN')`;
  if (toMilli(taken.quantity) < amount) {
    throw new StockLedgerError("lotInvalid");
  }
  const comment = `#${sale.number}`;
  const base = {
    productId: change.productId,
    warehouseId: change.warehouseId,
    userId,
  };
  await writeParts(tx, {
    ...base,
    before,
    parts: [{ lotId: from.id, quantity: amount }],
    data: { type: "SALE_RETURN", saleId: sale.id, comment },
  });
  await writeParts(tx, {
    ...base,
    before: fromMilli(toMilli(before) + amount),
    parts: [{ lotId: to.id, quantity: -amount }],
    data: { type: "SALE", saleId: sale.id, comment },
  });
}
