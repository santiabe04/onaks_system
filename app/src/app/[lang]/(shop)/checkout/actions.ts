"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActionDictionary } from "@/i18n/dictionary";
import { lockAccount, recomputeAccount } from "@/lib/account-ledger";
import { saleItemSnapshot } from "@/lib/admin-order";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { cartTotals } from "@/lib/cart";
import {
  cartDiscount,
  getCart,
  toCartLine,
  toFingerprintLine,
} from "@/lib/cart-queries";
import { cartFingerprint } from "@/lib/cart-fingerprint";
import { validateCheckoutForm, type CheckoutFormState } from "@/lib/checkout";
import { db } from "@/lib/db";

/** Corta la transacción con un mensaje para el cliente. */
class CheckoutError extends Error {}

/**
 * Confirma el carrito como pedido (solo efectivo por ahora). Los precios se
 * vuelven a calcular acá: si no coinciden con los que vio el cliente, se
 * rechaza para que revise el total.
 */
export async function placeOrder(
  _prev: CheckoutFormState,
  formData: FormData,
): Promise<CheckoutFormState> {
  const user = await requirePermission("sales:create");
  const t = getActionDictionary().checkout.errors;

  const result = validateCheckoutForm(formData, t);
  if (!result.ok) return result.state;
  const { addressId, notes, fingerprint } = result.data;
  const fail = (message: string): CheckoutFormState => ({
    errors: { form: [message] },
    values: result.values,
  });

  const customerId = user.customerId;
  if (!customerId) return fail(t.addressInvalid);

  let number: number;
  try {
    number = await db.$transaction(async (tx) => {
      // La dirección tiene que ser de la empresa y seguir vigente.
      const address = await tx.customerAddress.findFirst({
        where: { id: addressId, customerId, deletedAt: null },
        select: { id: true },
      });
      if (!address) throw new CheckoutError(t.addressInvalid);
      // Mismo orden de bloqueo que cobros y cambios de estado.
      await lockAccount(tx, customerId);

      // Con los precios de su lista y su descuento de ahora.
      const { available } = await getCart(user.personId, customerId, tx);
      if (available.length === 0) throw new CheckoutError(t.empty);
      if (cartFingerprint(available.map(toFingerprintLine)) !== fingerprint) {
        throw new CheckoutError(t.cartChanged);
      }

      // Se vacía primero: si otra confirmación (doble click, otra pestaña)
      // ya tomó estos productos, el DELETE espera a que termine y no borra
      // nada, así no se duplica el pedido.
      const removed = await tx.cartItem.deleteMany({
        where: {
          personId: user.personId,
          productId: { in: available.map((item) => item.productId) },
        },
      });
      if (removed.count !== available.length) {
        throw new CheckoutError(t.cartChanged);
      }

      const totals = cartTotals(available.map(toCartLine));
      const data = {
        addressId,
        subTotal: totals.net,
        tax: totals.tax,
        discount: cartDiscount(available),
        total: totals.total,
        notes,
        // Foto del producto al vender: los cambios posteriores no tocan el pedido.
        items: {
          create: available.map((item) =>
            saleItemSnapshot(
              { ...item.product, id: item.productId },
              item.quantity,
              item.price,
            ),
          ),
        },
      };

      // Si estaba modificando un pedido, se reemplaza ese (mismo número) y se
      // consume el permiso; si no, es un pedido nuevo.
      const [editing] = await tx.$queryRaw<{ id: string }[]>`
        SELECT s."id" FROM "sales" s
        JOIN "customer_addresses" a ON a."id" = s."address_id"
        WHERE s."editing_person_id" = ${user.personId}
          AND s."state" = 'PENDING' AND a."customer_id" = ${customerId}
        FOR UPDATE OF s`;
      let sale;
      if (editing) {
        const before = await tx.sale.findUniqueOrThrow({
          where: { id: editing.id },
          include: { items: true },
        });
        await tx.saleItem.deleteMany({ where: { saleId: editing.id } });
        sale = await tx.sale.update({
          where: { id: editing.id },
          data: { ...data, customerCanEdit: false, editingPersonId: null },
          include: { items: true },
        });
        await audit(tx, {
          action: "UPDATE",
          actorUserId: user.id,
          entityType: "SALE",
          entityId: sale.id,
          before,
          after: sale,
          metadata: { editedByCustomer: true },
        });
      } else {
        sale = await tx.sale.create({
          data: {
            ...data,
            userId: user.id,
            paymentMethod: "CASH",
          },
          include: { items: true },
        });
        await audit(tx, {
          action: "CREATE",
          actorUserId: user.id,
          entityType: "SALE",
          entityId: sale.id,
          after: sale,
        });
      }
      // Un saldo a favor puede dejar el pedido ya pagado (o cambia lo que falta).
      await recomputeAccount(tx, customerId);
      return sale.number;
    });
  } catch (error) {
    if (error instanceof CheckoutError) {
      // Que la página vuelva a mostrar el carrito y los precios actuales.
      revalidatePath("/[lang]", "layout");
      return fail(error.message);
    }
    throw error;
  }

  // El header muestra la cantidad del carrito.
  revalidatePath("/[lang]", "layout");
  redirect(`/orders/${number}?created=1`);
}
