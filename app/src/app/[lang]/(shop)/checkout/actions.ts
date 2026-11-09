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
import { latestCosts } from "@/lib/cost-queries";
import { applyCreditCheck } from "@/lib/credit-ledger";
import { db } from "@/lib/db";
import { hasUpload } from "@/lib/product-image";
import { transferAvailable } from "@/lib/transfer";
import {
  processProof,
  removeProofFile,
  saveProofFile,
} from "@/lib/transfer-proof-files";

/** Corta la transacción con un mensaje para el cliente. */
class CheckoutError extends Error {}

/**
 * Confirma el carrito como pedido, en efectivo al recibir o por transferencia
 * (con el comprobante adjunto, si ya lo tiene). Los precios se vuelven a
 * calcular acá: si no coinciden con los que vio el cliente, se rechaza para
 * que revise el total.
 */
export async function placeOrder(
  _prev: CheckoutFormState,
  formData: FormData,
): Promise<CheckoutFormState> {
  const user = await requirePermission("sales:create");
  const dictionary = getActionDictionary();
  const t = dictionary.checkout.errors;
  const transferErrors = dictionary.transfer.errors;

  const result = validateCheckoutForm(formData, t);
  if (!result.ok) return result.state;
  const { addressId, notes, fingerprint, paymentMethod } = result.data;
  const fail = (message: string): CheckoutFormState => ({
    errors: { form: [message] },
    values: result.values,
  });

  const customerId = user.customerId;
  if (!customerId) return fail(t.addressInvalid);

  // Transferencia: tiene que haber datos de cobro cargados y, si se adjunta,
  // un comprobante válido. El archivo se guarda antes de la transacción y se
  // borra si ésta falla, para no dejar archivos sin pedido.
  let proofFile: string | null = null;
  if (paymentMethod === "TRANSFER") {
    const settings = await db.transferSettings.findUnique({
      where: { id: 1 },
      select: { cbu: true, alias: true },
    });
    if (!transferAvailable(settings)) return fail(transferErrors.unavailable);
    const proof = formData.get("proof");
    if (hasUpload(proof)) {
      const processed = await processProof(proof);
      if (!processed.ok) {
        return fail(
          processed.error === "tooLarge"
            ? transferErrors.tooLarge
            : transferErrors.invalid,
        );
      }
      proofFile = await saveProofFile(processed.data, processed.ext);
    }
  }

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
      const costs = await latestCosts(
        available.map((item) => item.productId),
        tx,
      );
      const data = {
        addressId,
        subTotal: totals.net,
        tax: totals.tax,
        discount: cartDiscount(available),
        total: totals.total,
        notes,
        paymentMethod,
        // Foto del producto al vender: los cambios posteriores no tocan el pedido.
        items: {
          create: available.map((item) =>
            saleItemSnapshot(
              { ...item.product, id: item.productId },
              item.quantity,
              item.price,
              costs[item.productId],
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
      if (proofFile) {
        const proof = await tx.transferProof.create({
          data: { saleId: sale.id, file: proofFile, uploadedById: user.id },
        });
        await audit(tx, {
          action: "CREATE",
          actorUserId: user.id,
          entityType: "TRANSFER_PROOF",
          entityId: proof.id,
          after: proof,
        });
      }
      // Un saldo a favor puede dejar el pedido ya pagado (o cambia lo que falta).
      const account = await recomputeAccount(tx, customerId);
      // Si supera el límite o debe algo vencido, queda retenido para revisar.
      await applyCreditCheck(tx, {
        saleId: sale.id,
        customerId,
        account,
        userId: user.id,
      });
      return sale.number;
    });
  } catch (error) {
    if (proofFile) await removeProofFile(proofFile);
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
