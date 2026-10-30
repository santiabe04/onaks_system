import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { SaleState } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { CHARGED_SALE_STATES } from "./account";
import { lockAccount, recomputeAccount } from "./account-ledger";
import { audit } from "./audit";
import { fromMilli, toMilli } from "./quantity";
import { canTransition, pendingReturns, stockEffect } from "./sale-state";
import { resolveWarehouses, type StateChangeInput } from "./sale-state-form";
import { recordSaleMovements, StockLedgerError } from "./stock-ledger";

type Messages = Dictionary["adminOrders"]["stateChange"]["errors"];

/** Un cambio de estado que no se puede hacer, con el mensaje para el admin. */
export class StateChangeError extends Error {}

/**
 * Cambia el estado de un pedido dentro de la transacción que recibe (la usan
 * el cambio individual y el masivo). Al llegar a En preparación descuenta el
 * stock de los depósitos elegidos; al volver a Pendiente o cancelar después,
 * lo devuelve a donde salió. Recalcula la cuenta corriente del cliente.
 */
export async function applySaleStateChange(
  tx: Prisma.TransactionClient,
  saleId: string,
  input: StateChangeInput,
  userId: string,
  t: Messages,
): Promise<void> {
  // Primero la cuenta del cliente y después el pedido, en el mismo orden
  // que los cobros: así dos transacciones no se bloquean entre sí.
  const owner = await tx.sale.findUnique({
    where: { id: saleId },
    select: { address: { select: { customerId: true } } },
  });
  if (!owner) throw new StateChangeError(t.notFound);
  const customerId = owner.address.customerId;
  await lockAccount(tx, customerId);

  // Bloqueado hasta el final: dos cambios a la vez no descuentan dos veces.
  const [locked] = await tx.$queryRaw<
    { state: SaleState; number: number; editing: boolean }[]
  >`SELECT "state", "number", "editing_person_id" IS NOT NULL AS "editing"
    FROM "sales" WHERE "id" = ${saleId} FOR UPDATE`;
  if (!locked) throw new StateChangeError(t.notFound);
  if (locked.state !== input.from) throw new StateChangeError(t.stale);
  // Sus productos están en el carrito del cliente: no se toca hasta que confirme.
  if (locked.editing) throw new StateChangeError(t.beingEdited);
  if (!canTransition(locked.state, input.to)) {
    throw new StateChangeError(t.notAllowed);
  }
  const sale = { id: saleId, number: locked.number };

  const effect = stockEffect(locked.state, input.to);
  let stock: Record<string, unknown> | undefined;
  try {
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
      await recordSaleMovements(tx, sale, "SALE", lines, userId);
      stock = { deducted: lines };
    } else if (effect === "return") {
      const movements = await tx.stockMovement.findMany({
        where: { saleId },
        select: { productId: true, warehouseId: true, quantity: true },
      });
      const lines = pendingReturns(movements);
      await recordSaleMovements(tx, sale, "SALE_RETURN", lines, userId);
      stock = { returned: lines };
    }
  } catch (error) {
    if (error instanceof StockLedgerError) {
      throw new StateChangeError(t.warehouseInactive);
    }
    throw error;
  }

  await tx.sale.update({
    where: { id: saleId },
    data: {
      state: input.to,
      // El permiso de modificar es solo para pedidos Pendientes.
      customerCanEdit: false,
      // Fecha de venta de los reportes: al entregarse; se borra si vuelve atrás.
      deliveredAt: CHARGED_SALE_STATES.includes(input.to)
        ? CHARGED_SALE_STATES.includes(locked.state)
          ? undefined
          : new Date()
        : null,
    },
  });
  await audit(tx, {
    action: "UPDATE",
    actorUserId: userId,
    entityType: "SALE",
    entityId: saleId,
    before: { state: locked.state },
    after: { state: input.to },
    metadata: { comment: input.comment, ...stock },
  });
  // Entregar (o volver atrás) cambia la deuda y el estado de pago.
  await recomputeAccount(tx, customerId);
}
