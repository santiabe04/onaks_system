"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SalePaymentState, SaleState } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { getActionDictionary } from "@/i18n/dictionary";
import { lockAccount, recomputeAccount } from "@/lib/account-ledger";
import { audit } from "@/lib/audit";
import { requirePermission, type SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { hasUpload } from "@/lib/product-image";
import { planRepeat } from "@/lib/repeat-order";
import { canUploadProof } from "@/lib/transfer";
import {
  processProof,
  removeProofFile,
  saveProofFile,
} from "@/lib/transfer-proof-files";
import { STATE_COMMENT_MAX_LENGTH } from "@/lib/sale-state-form";

// What the customer can do with an order from their company while it is
// Pending: cancel it and, if the admin enabled it, edit it (it goes back to the
// cart and is confirmed again with the same number).

export type OrderActionState = { error?: string };

/** Aborts the transaction with a message for the customer. */
class OrderActionError extends Error {}

type LockedSale = {
  id: string;
  number: number;
  state: SaleState;
  customerCanEdit: boolean;
  editingPersonId: string | null;
};

/**
 * Locks the company's account and the order (same order as payments and
 * status changes) and returns it if it belongs to the user's company.
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

/** The customer cancels a Pending order (also if it was being edited). */
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
 * Starts editing an enabled order: its products are added to the cart
 * and, on confirmation, replace the order's (same number).
 */
// No previous-state parameter: useActionState passes it but it is not used.
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
      // Already editing it: just go to the cart.
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

/** Stops editing: the order stays as it was (the cart is not touched). */
// No previous-state parameter: useActionState passes it but it is not used.
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

/**
 * Repeats a company order: adds its products and quantities to the cart
 * at today's prices and list (nothing is copied from the old price). What
 * cannot be bought today is skipped and reported in the cart. The customer
 * reviews and confirms at checkout, as always.
 */
export async function repeatOrder(saleId: string): Promise<OrderActionState> {
  const user = await requirePermission("sales:create");
  const t = messages();
  const customerId = user.customerId;
  if (!customerId || !isCuid(saleId)) return { error: t.notFound };

  // From the user's company: another company's looks the same as one that does not exist.
  const sale = await db.sale.findFirst({
    where: { id: saleId, address: { customerId } },
    select: {
      number: true,
      items: {
        select: {
          productId: true,
          quantity: true,
          product: {
            select: {
              isActive: true,
              deletedAt: true,
              measurementUnit: { select: { allowsDecimals: true } },
            },
          },
        },
      },
    },
  });
  if (!sale) return { error: t.notFound };

  const plan = planRepeat(
    sale.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      available: item.product.isActive && !item.product.deletedAt,
      allowsDecimals: item.product.measurementUnit.allowsDecimals,
    })),
  );
  if (plan.adds.length === 0) return { error: t.repeatNothing };

  await db.$transaction(
    plan.adds.map((add) =>
      db.cartItem.upsert({
        where: {
          personId_productId: {
            personId: user.personId,
            productId: add.productId,
          },
        },
        create: {
          personId: user.personId,
          productId: add.productId,
          quantity: add.quantity,
        },
        update: { quantity: { increment: add.quantity } },
      }),
    ),
  );

  // The header shows the cart quantity.
  revalidatePath("/[lang]", "layout");
  redirect(
    `/cart?${new URLSearchParams({
      repeated: String(plan.adds.length),
      omitted: String(plan.omitted),
      from: String(sale.number),
    })}`,
  );
}

/**
 * The customer uploads the transfer receipt for an order of their
 * company. The file is saved before the transaction (and deleted if it fails);
 * with the order locked, it is checked again that one can still be uploaded
 * and that there is no other one awaiting review.
 */
export async function uploadTransferProof(
  saleId: string,
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requirePermission("sales:create");
  const t = getActionDictionary().transfer.errors;
  const customerId = user.customerId;
  if (!customerId || !isCuid(saleId)) return { error: t.notFound };

  const proof = formData.get("proof");
  if (!hasUpload(proof)) return { error: t.invalid };
  const processed = await processProof(proof);
  if (!processed.ok) {
    return {
      error: processed.error === "tooLarge" ? t.tooLarge : t.invalid,
    };
  }
  const file = await saveProofFile(processed.data, processed.ext);

  try {
    await db.$transaction(async (tx) => {
      // Same lock order as payments and status changes: account and order.
      await lockAccount(tx, customerId);
      const [sale] = await tx.$queryRaw<
        {
          paymentMethod: string;
          state: SaleState;
          paymentState: SalePaymentState;
        }[]
      >`
        SELECT s."payment_method"::text AS "paymentMethod", s."state",
               s."payment_state" AS "paymentState"
        FROM "sales" s
        JOIN "customer_addresses" a ON a."id" = s."address_id"
        WHERE s."id" = ${saleId} AND a."customer_id" = ${customerId}
        FOR UPDATE OF s`;
      if (!sale) throw new OrderActionError(t.notFound);
      const proofs = await tx.transferProof.findMany({
        where: { saleId },
        select: { state: true },
      });
      if (!canUploadProof(sale, proofs)) {
        throw new OrderActionError(t.notAllowed);
      }
      const created = await tx.transferProof.create({
        data: { saleId, file, uploadedById: user.id },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: "TRANSFER_PROOF",
        entityId: created.id,
        after: created,
      });
    });
  } catch (error) {
    await removeProofFile(file);
    if (error instanceof OrderActionError) return { error: error.message };
    throw error;
  }

  // The order detail (and the admin's notice) change.
  revalidatePath("/[lang]", "layout");
  return {};
}
