"use server";

import { revalidatePath } from "next/cache";
import type { SaleState } from "@/generated/prisma/enums";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { canTransition, pendingReturns, stockEffect } from "@/lib/sale-state";
import {
  parseStateChangeForm,
  resolveWarehouses,
  type StateChangeFormState,
} from "@/lib/sale-state-form";
import { fromMilli, toMilli } from "@/lib/quantity";
import { recordSaleMovements, StockLedgerError } from "@/lib/stock-ledger";

/** Corta la transacción con un mensaje para el admin. */
class StateChangeError extends Error {}

/**
 * Cambia el estado de un pedido. Al llegar a En preparación descuenta el
 * stock de los depósitos elegidos; al volver a Pendiente o cancelar después,
 * lo devuelve a donde salió. Todo en una transacción, con el pedido bloqueado.
 */
export async function changeSaleState(
  saleId: string,
  _prev: StateChangeFormState,
  formData: FormData,
): Promise<StateChangeFormState> {
  const user = await requirePermission("sales:manage");
  const t = getActionDictionary().adminOrders.stateChange.errors;

  if (!isCuid(saleId)) return { error: t.notFound };
  const parsed = parseStateChangeForm(formData, t);
  if (!parsed.ok) return { error: parsed.error };
  const input = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      // Bloqueado hasta el final: dos cambios a la vez no descuentan dos veces.
      const [locked] = await tx.$queryRaw<
        { state: SaleState; number: number }[]
      >`SELECT "state", "number" FROM "sales" WHERE "id" = ${saleId} FOR UPDATE`;
      if (!locked) throw new StateChangeError(t.notFound);
      if (locked.state !== input.from) throw new StateChangeError(t.stale);
      if (!canTransition(locked.state, input.to)) {
        throw new StateChangeError(t.notAllowed);
      }
      const sale = { id: saleId, number: locked.number };

      const effect = stockEffect(locked.state, input.to);
      let stock: Record<string, unknown> | undefined;
      if (effect === "deduct") {
        const items = await tx.saleItem.findMany({
          where: { saleId },
          select: { productId: true, quantity: true },
        });
        const warehouses = resolveWarehouses(
          items.map((item) => item.productId),
          input,
        );
        if (!warehouses) throw new StateChangeError(t.warehouseRequired);
        const lines = items.map((item) => ({
          productId: item.productId,
          warehouseId: warehouses[item.productId],
          // sale_items guarda 4 decimales; el stock, 3.
          quantity: fromMilli(-toMilli(item.quantity)),
        }));
        await recordSaleMovements(tx, sale, "SALE", lines, user.id);
        stock = { deducted: lines };
      } else if (effect === "return") {
        const movements = await tx.stockMovement.findMany({
          where: { saleId },
          select: { productId: true, warehouseId: true, quantity: true },
        });
        const lines = pendingReturns(movements);
        await recordSaleMovements(tx, sale, "SALE_RETURN", lines, user.id);
        stock = { returned: lines };
      }

      await tx.sale.update({
        where: { id: saleId },
        data: { state: input.to },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "SALE",
        entityId: saleId,
        before: { state: locked.state },
        after: { state: input.to },
        metadata: { comment: input.comment, ...stock },
      });
    });
  } catch (error) {
    if (error instanceof StateChangeError) return { error: error.message };
    if (error instanceof StockLedgerError) {
      return { error: t.warehouseInactive };
    }
    throw error;
  }

  // Detalle, listas, Stock (reservado) y dashboard.
  revalidatePath("/[lang]", "layout");
  return { savedAt: Date.now() };
}
