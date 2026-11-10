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
import { enqueueOrderNotice } from "@/lib/order-notice-ledger";
import { hasUpload } from "@/lib/product-image";
import { transferAvailable } from "@/lib/transfer";
import {
  processProof,
  removeProofFile,
  saveProofFile,
} from "@/lib/transfer-proof-files";

/** Aborts the transaction with a message for the customer. */
class CheckoutError extends Error {}

/**
 * Confirms the cart as an order, cash on delivery or by transfer
 * (with the receipt attached, if it already has one). Prices are recalculated
 * here: if they do not match what the customer saw, it is rejected so that
 * they review the total.
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

  // Transfer: payment details must be loaded and, if one is attached,
  // a valid receipt. The file is saved before the transaction and
  // deleted if it fails, so no files are left without an order.
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
      // The address must belong to the company and still be active.
      const address = await tx.customerAddress.findFirst({
        where: { id: addressId, customerId, deletedAt: null },
        select: { id: true },
      });
      if (!address) throw new CheckoutError(t.addressInvalid);
      // Same lock order as payments and status changes.
      await lockAccount(tx, customerId);

      // With the prices of its list and the current discount.
      const { available } = await getCart(user.personId, customerId, tx);
      if (available.length === 0) throw new CheckoutError(t.empty);
      if (cartFingerprint(available.map(toFingerprintLine)) !== fingerprint) {
        throw new CheckoutError(t.cartChanged);
      }

      // Emptied first: if another confirmation (double click, another tab)
      // has already taken these products, the DELETE waits for it to finish and deletes
      // nothing, so the order is not duplicated.
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
        // Product snapshot at sale: later changes do not touch the order.
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

      // If an order was being edited, that one is replaced (same number) and
      // the permission is consumed; otherwise it is a new order.
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
      // A credit balance can leave the order already paid (or change what is left).
      const account = await recomputeAccount(tx, customerId);
      // If it exceeds the limit or owes something overdue, it is held for review.
      await applyCreditCheck(tx, {
        saleId: sale.id,
        customerId,
        account,
        userId: user.id,
      });
      // Confirmed: email notice (if it replaces one already notified, it is not repeated).
      await enqueueOrderNotice(tx, sale, "PENDING");
      return sale.number;
    });
  } catch (error) {
    if (proofFile) await removeProofFile(proofFile);
    if (error instanceof CheckoutError) {
      // So the page shows the cart and current prices again.
      revalidatePath("/[lang]", "layout");
      return fail(error.message);
    }
    throw error;
  }

  // The header shows the cart quantity.
  revalidatePath("/[lang]", "layout");
  redirect(`/orders/${number}?created=1`);
}
