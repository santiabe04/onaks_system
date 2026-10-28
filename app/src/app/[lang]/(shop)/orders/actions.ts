"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SaleState } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { getActionDictionary } from "@/i18n/dictionary";
import { lockAccount, recomputeAccount } from "@/lib/account-ledger";
import { audit } from "@/lib/audit";
import { requirePermission, type SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { STATE_COMMENT_MAX_LENGTH } from "@/lib/sale-state-form";

// Lo que el cliente puede hacer con un pedido de su empresa mientras está
// Pendiente: cancelarlo y, si el admin lo habilitó, modificarlo (vuelve al
// carrito y se confirma de nuevo con el mismo número).

export type OrderActionState = { error?: string };

/** Corta la transacción con un mensaje para el cliente. */
class OrderActionError extends Error {}

type LockedSale = {
  id: string;
  number: number;
  state: SaleState;
  customerCanEdit: boolean;
  editingPersonId: string | null;
};

/**
 * Bloquea la cuenta de la empresa y el pedido (mismo orden que cobros y
 * cambios de estado) y lo devuelve si es de la empresa del usuario.
 */
async function lockOwnSale(
  tx: Prisma.TransactionClient,
  user: SessionUser,
  saleId: string,
  t: ReturnType<typeof messages>,
): Promise<LockedSale & { customerId: string }> {
  const customerId = user.customerId;
  if (!customerId || !isCuid(saleId)) throw new OrderActionError(t.notFound);
  await lockAccount(tx, customerId);
  const [sale] = await tx.$queryRaw<LockedSale[]>`
    SELECT s."id", s."number", s."state",
           s."customer_can_edit" AS "customerCanEdit",
           s."editing_person_id" AS "editingPersonId"
    FROM "sales" s
    JOIN "customer_addresses" a ON a."id" = s."address_id"
    WHERE s."id" = ${saleId} AND a."customer_id" = ${customerId}
    FOR UPDATE OF s`;
  if (!sale) throw new OrderActionError(t.notFound);
  return { ...sale, customerId };
}

function messages() {
  return getActionDictionary().orders.errors;
}

async function run(
  work: () => Promise<void>,
): Promise<OrderActionState | null> {
  try {
    await work();
    return null;
  } catch (error) {
    if (error instanceof OrderActionError) return { error: error.message };
    throw error;
  }
}

/** El cliente cancela un pedido Pendiente (también si lo estaba modificando). */
export async function cancelOwnOrder(
  saleId: string,
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requirePermission("sales:create");
  const t = messages();
  const raw = formData.get("comment");
  const comment =
    (typeof raw === "string" ? raw.trim() : "").slice(
      0,
      STATE_COMMENT_MAX_LENGTH,
    ) || null;

  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const sale = await lockOwnSale(tx, user, saleId, t);
      if (sale.state !== "PENDING") throw new OrderActionError(t.notPending);
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          state: "CANCELED",
          customerCanEdit: false,
          editingPersonId: null,
        },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "SALE",
        entityId: sale.id,
        before: { state: sale.state },
        after: { state: "CANCELED" },
        metadata: { comment, byCustomer: true },
      });
      await recomputeAccount(tx, sale.customerId);
    }),
  );
  if (failed) return failed;

  revalidatePath("/[lang]", "layout");
  return {};
}

/**
 * Empieza a modificar un pedido habilitado: sus productos se suman al carrito
 * y, al confirmar, reemplazan los del pedido (mismo número).
 */
// Sin parámetro de estado previo: useActionState lo pasa pero no se usa.
export async function startOrderEdit(
  saleId: string,
): Promise<OrderActionState> {
  const user = await requirePermission("sales:create");
  const t = messages();

  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const sale = await lockOwnSale(tx, user, saleId, t);
      if (sale.state !== "PENDING") throw new OrderActionError(t.notPending);
      if (!sale.customerCanEdit) throw new OrderActionError(t.notEditable);
      // Ya lo estaba modificando: solo hay que ir al carrito.
      if (sale.editingPersonId === user.personId) return;
      if (sale.editingPersonId) throw new OrderActionError(t.editedByOther);
      const other = await tx.sale.findFirst({
        where: { editingPersonId: user.personId },
        select: { number: true },
      });
      if (other) {
        throw new OrderActionError(
          t.alreadyEditing.replace("{number}", String(other.number)),
        );
      }

      const items = await tx.saleItem.findMany({
        where: { saleId: sale.id },
        select: { productId: true, quantity: true },
      });
      for (const item of items) {
        await tx.cartItem.upsert({
          where: {
            personId_productId: {
              personId: user.personId,
              productId: item.productId,
            },
          },
          create: {
            personId: user.personId,
            productId: item.productId,
            quantity: item.quantity,
          },
          update: { quantity: { increment: item.quantity } },
        });
      }
      await tx.sale.update({
        where: { id: sale.id },
        data: { editingPersonId: user.personId },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "SALE",
        entityId: sale.id,
        metadata: { editStarted: true },
      });
    }),
  );
  if (failed) return failed;

  revalidatePath("/[lang]", "layout");
  redirect("/cart");
}

/** Deja de modificar: el pedido queda como estaba (el carrito no se toca). */
// Sin parámetro de estado previo: useActionState lo pasa pero no se usa.
export async function discardOrderEdit(
  saleId: string,
): Promise<OrderActionState> {
  const user = await requirePermission("sales:create");
  const t = messages();

  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const sale = await lockOwnSale(tx, user, saleId, t);
      if (sale.editingPersonId !== user.personId) return;
      await tx.sale.update({
        where: { id: sale.id },
        data: { editingPersonId: null },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "SALE",
        entityId: sale.id,
        metadata: { editDiscarded: true },
      });
    }),
  );
  if (failed) return failed;

  revalidatePath("/[lang]", "layout");
  return {};
}
