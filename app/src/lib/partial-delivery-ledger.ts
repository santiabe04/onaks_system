import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit";
import { cartTotals } from "./cart";
import { deliveredQuantities, type Shortage } from "./partial-delivery";
import { fromMilli, toMilli } from "./quantity";
import { pendingReturns } from "./sale-state";
import { recordMovement, recordSaleMovements } from "./stock-ledger";

/**
 * Aplica una entrega parcial dentro de la transacción de la parada, antes de
 * pasar el pedido a Entregado:
 * - lo que falta vuelve al depósito del que salió (SALE_RETURN);
 * - si se rompió o venció, además se da de baja (WRITE_OFF), así el libro lo
 *   muestra y una cancelación posterior no devuelve unidades rotas;
 * - el pedido queda con lo entregado y se recalculan sus totales.
 */
export async function applyShortages(
  tx: Prisma.TransactionClient,
  sale: { id: string; number: number },
  sheetNumber: number,
  shortages: Shortage[],
  userId: string,
): Promise<void> {
  if (shortages.length === 0) return;

  const before = await tx.sale.findUniqueOrThrow({
    where: { id: sale.id },
    include: { items: true },
  });

  // Stock: lo que salió de cada depósito por este pedido (neto), por producto.
  const movements = await tx.stockMovement.findMany({
    where: { saleId: sale.id },
    select: { productId: true, warehouseId: true, quantity: true },
  });
  const deducted = pendingReturns(movements);
  for (const shortage of shortages) {
    let remaining = toMilli(shortage.missing);
    const lines: {
      productId: string;
      warehouseId: string;
      quantity: string;
    }[] = [];
    for (const line of deducted) {
      if (line.productId !== shortage.productId || remaining <= BigInt(0)) {
        continue;
      }
      const take =
        toMilli(line.quantity) < remaining ? toMilli(line.quantity) : remaining;
      remaining -= take;
      lines.push({ ...line, quantity: fromMilli(take) });
    }
    await recordSaleMovements(tx, sale, "SALE_RETURN", lines, userId);
    if (shortage.reason === "WRITTEN_OFF") {
      for (const line of lines) {
        await recordMovement(
          tx,
          {
            type: "WRITE_OFF",
            productId: line.productId,
            warehouseId: line.warehouseId,
            toWarehouseId: null,
            quantity: line.quantity,
            comment: `Hoja #${sheetNumber} · pedido #${sale.number}`,
          },
          userId,
        );
      }
    }
  }

  // Pedido: cantidades entregadas (0 = se quita el producto) y totales.
  const quantities = deliveredQuantities(before.items, shortages);
  for (const { productId, quantity } of quantities) {
    const where = { saleId_productId: { saleId: sale.id, productId } };
    if (toMilli(quantity) === BigInt(0)) {
      await tx.saleItem.delete({ where });
    } else {
      await tx.saleItem.update({ where, data: { quantity } });
    }
  }
  const remainingItems = before.items
    .map((item) => ({
      ...item,
      quantity: quantities.find((q) => q.productId === item.productId)!
        .quantity,
    }))
    .filter((item) => toMilli(item.quantity) > BigInt(0));
  const totals = cartTotals(
    remainingItems.map((item) => ({
      price: item.unitPrice,
      rate: item.unitTaxRate,
      quantity: item.quantity,
      weight: item.unitWeight,
    })),
  );
  const after = await tx.sale.update({
    where: { id: sale.id },
    data: { subTotal: totals.net, tax: totals.tax, total: totals.total },
    include: { items: true },
  });
  await audit(tx, {
    action: "UPDATE",
    actorUserId: userId,
    entityType: "SALE",
    entityId: sale.id,
    before,
    after,
    metadata: { partialDelivery: shortages, sheet: sheetNumber },
  });
}
