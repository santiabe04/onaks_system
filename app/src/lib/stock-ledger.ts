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

/** Expected error when recording a movement; the action shows it in the form. */
export class StockLedgerError extends Error {
  constructor(readonly code: LedgerError) {
    super(code);
  }
}

/**
 * Locks a product's balance in a warehouse until the end of the
 * transaction and returns it. If it does not exist yet, it creates it at 0.
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

// --- Lots -----------------------------------------------------------------
// Only products that track expiry (`tracks_expiry`) carry lots.
// An outflow takes first from the lot that expires first (FEFO) and what the lots do not
// cover leaves from the stock with no lot; each leg is a movement with its `lot_id`.

/** One leg of a movement: which lot (null = no lot) and how much, with sign. */
type Part = { lotId: string | null; quantity: bigint };
/** Lot and expiry (YYYY-MM-DD) of what is received or reversed. */
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

/** The lots of a product in a warehouse, locked (always in the same order). */
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

/** Outflow of `amount` (positive): first what expires first, the rest with no lot. */
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

/** Returns to the lots the order took the goods from (the rest, with no lot). */
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
 * A customer return goes back to the lots the order left from,
 * deducting what other notes of the same order already returned (the rest,
 * with no lot).
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
 * Takes from the lots where that note left goods (writing off what was returned or
 * voiding the return); what has no lot leaves from the stock with no lot.
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

/** Reverses an entry: takes it from the lot that was received (what is no longer there, from the stock with no lot). */
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
 * Writes the legs of a movement on an already locked balance: lots,
 * movements with running balance, audit and the product's final balance.
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
  // A zero leg is redundant, unless it is the only one (the movement exists anyway).
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
 * Records a manual movement: validates product and warehouses, locks the
 * balances, calculates the legs (`planMovement`) and writes balance + movement +
 * audit. All inside the transaction it receives.
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
  // FOR SHARE: while the movement runs nobody can deactivate the warehouse
  // (deactivation takes the row's exclusive lock to check the stock).
  const active = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "warehouses"
    WHERE "id" = ANY(${warehouseIds}) AND "is_active" = true
    FOR SHARE`;
  if (active.length !== warehouseIds.length) {
    throw new StockLedgerError("warehouseInactive");
  }

  // Always in the same order: two crossed transfers do not block each other.
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
  // What left each lot in a transfer arrives at the same lot of the destination.
  let moved: { key: LotKey; quantity: bigint }[] = [];
  for (const leg of legs) {
    const delta = toMilli(leg.quantity);
    let parts: Part[] = [{ lotId: null, quantity: delta }];
    if (tracked && leg.type === "ENTRY") {
      // A manual entry of a product with expiry says which lot it is.
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
 * Takes out of the balance what was not there (inventory adjustment of a difference,
 * not of a count): locks the balance and writes balance + negative ADJUSTMENT
 * movement + audit. The warehouse must be active.
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
  /** Signed change: negative when deducting, positive when entering. */
  quantity: string;
  /** Lot and expiry of what comes in or is reversed on a receipt. */
  lot?: LotKey;
};

/** The document that moves the stock: an order, a receiving report or a return. */
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
      /** The note's order: what is returned left from its lots. */
      noteSaleId: string | null;
      comment: string;
    };

/**
 * Moves the stock of a document: locks the balances in order, writes balance
 * + movement (with the document) + audit. The warehouses must be
 * active; the product may be paused or deleted (the document already exists).
 * Stock may end up negative.
 */
async function recordLinkedMovements(
  tx: Prisma.TransactionClient,
  link: MovementLink,
  lines: LinkedStockLine[],
  userId: string,
): Promise<void> {
  if (lines.length === 0) return;

  const warehouseIds = [...new Set(lines.map((line) => line.warehouseId))];
  // FOR SHARE: same as in recordMovement, nobody deactivates the warehouse meanwhile.
  const active = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "warehouses"
    WHERE "id" = ANY(${warehouseIds}) AND "is_active" = true
    FOR SHARE`;
  if (active.length !== warehouseIds.length) {
    throw new StockLedgerError("warehouseInactive");
  }

  // Always the same order (product, warehouse): two documents do not block each other.
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

/** Deducts (SALE) or returns (SALE_RETURN) an order's stock. */
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
 * Enters (PURCHASE_RECEIPT, positive quantities) or reverses
 * (PURCHASE_RECEIPT_REVERSAL, negative) what a receiving report did.
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
 * Moves the stock of a customer return: enters what was returned
 * (CUSTOMER_RETURN, positive), writes it off (WRITE_OFF, negative) or reverses
 * the entry on voiding it (CUSTOMER_RETURN_REVERSAL, negative).
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
 * Changes which lot what an order already deducted comes from: returns `quantity` to
 * the source lot and takes it out of the destination one, two movements of the order (the
 * product's balance does not change). The source must still have at least
 * that quantity taken by the order and the destination must cover it.
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
