"use server";

import { revalidatePath } from "next/cache";
import { getActionDictionary } from "@/i18n/dictionary";
import { lockAccount } from "@/lib/account-ledger";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { CREDIT_RELEASE_NOTE_MAX_LENGTH } from "@/lib/credit";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import {
  applySaleStateChange,
  StateChangeError,
} from "@/lib/sale-state-change";
import {
  parseBulkStateChangeForm,
  parseStateChangeForm,
  type BulkStateChangeState,
  type StateChangeFormState,
} from "@/lib/sale-state-form";

/** Changes the status of an order (see `applySaleStateChange`). */
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

  try {
    await db.$transaction((tx) =>
      applySaleStateChange(tx, saleId, parsed.data, user.id, t),
    );
  } catch (error) {
    if (error instanceof StateChangeError) return { error: error.message };
    throw error;
  }

  // Detail, lists, Stock (reserved) and dashboard.
  revalidatePath("/[lang]", "layout");
  return { savedAt: Date.now() };
}

/**
 * Enables (or removes) the customer's ability to edit a Pending order. When
 * it is removed while being used, the order stays as it was (the products
 * stay in its cart).
 */
export async function setCustomerCanEdit(
  saleId: string,
  allow: boolean,
): Promise<StateChangeFormState> {
  const user = await requirePermission("sales:manage");
  const t = getActionDictionary().adminOrders.stateChange.errors;
  if (!isCuid(saleId)) return { error: t.notFound };

  try {
    await db.$transaction(async (tx) => {
      const owner = await tx.sale.findUnique({
        where: { id: saleId },
        select: { address: { select: { customerId: true } } },
      });
      if (!owner) throw new StateChangeError(t.notFound);
      await lockAccount(tx, owner.address.customerId);
      const before = await tx.sale.findUniqueOrThrow({
        where: { id: saleId },
        select: { state: true, customerCanEdit: true, editingPersonId: true },
      });
      if (before.state !== "PENDING") {
        throw new StateChangeError(t.notEditable);
      }
      const after = await tx.sale.update({
        where: { id: saleId },
        data: allow
          ? { customerCanEdit: true }
          : { customerCanEdit: false, editingPersonId: null },
        select: { state: true, customerCanEdit: true, editingPersonId: true },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "SALE",
        entityId: saleId,
        before,
        after,
      });
    });
  } catch (error) {
    if (error instanceof StateChangeError) return { error: error.message };
    throw error;
  }

  revalidatePath("/[lang]", "layout");
  return { savedAt: Date.now() };
}

/**
 * Changes the status of several orders at once (e.g. a whole zone to On the road).
 * Each one in its own transaction, with the same rules as the individual
 * change: if one cannot, the others continue and it reports which one and why.
 */
export async function changeSalesStateBulk(
  _prev: BulkStateChangeState,
  formData: FormData,
): Promise<BulkStateChangeState> {
  const user = await requirePermission("sales:manage");
  const t = getActionDictionary().adminOrders.stateChange.errors;

  const parsed = parseBulkStateChangeForm(formData, t);
  if (!parsed.ok) return { error: parsed.error };
  const { sales, to, warehouseId, comment } = parsed.data;

  const numbers = new Map(
    (
      await db.sale.findMany({
        where: { id: { in: sales.map((sale) => sale.id) } },
        select: { id: true, number: true },
      })
    ).map((sale) => [sale.id, sale.number]),
  );

  const results: NonNullable<BulkStateChangeState["results"]> = [];
  // One at a time and in order: each order locks its account and its stock separately.
  for (const sale of sales) {
    const number = numbers.get(sale.id);
    if (number === undefined) continue;
    try {
      await db.$transaction((tx) =>
        applySaleStateChange(
          tx,
          sale.id,
          { from: sale.from, to, warehouseId, itemWarehouses: {}, comment },
          user.id,
          t,
        ),
      );
      results.push({ number });
    } catch (error) {
      if (!(error instanceof StateChangeError)) throw error;
      results.push({ number, error: error.message });
    }
  }

  revalidatePath("/[lang]", "layout");
  return { results, savedAt: Date.now() };
}

/**
 * Approves an order held for credit (over the limit or with an overdue
 * debt): from there it follows the normal flow. Records who and why.
 */
export async function releaseCreditHold(
  saleId: string,
  _prev: StateChangeFormState,
  formData: FormData,
): Promise<StateChangeFormState> {
  const user = await requirePermission("sales:manage");
  const t = getActionDictionary().adminOrders.creditHold.errors;
  if (!isCuid(saleId)) return { error: t.notFound };
  const raw = formData.get("note");
  const note = typeof raw === "string" ? raw.trim() : "";
  if (note.length > CREDIT_RELEASE_NOTE_MAX_LENGTH) {
    return { error: t.noteTooLong };
  }

  const error = await db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<
      { held: boolean }[]
    >`SELECT ("credit_hold_at" IS NOT NULL AND "credit_released_at" IS NULL) AS "held"
      FROM "sales" WHERE "id" = ${saleId} FOR UPDATE`;
    if (!locked) return t.notFound;
    if (!locked.held) return t.notHeld;
    const after = await tx.sale.update({
      where: { id: saleId },
      data: {
        creditReleasedAt: new Date(),
        creditReleasedById: user.id,
        creditReleaseNote: note || null,
      },
      select: { creditReleasedAt: true, creditReleaseNote: true },
    });
    await audit(tx, {
      action: "UPDATE",
      actorUserId: user.id,
      entityType: "SALE",
      entityId: saleId,
      after,
      metadata: { creditRelease: true, comment: note || null },
    });
    return null;
  });
  if (error) return { error };

  revalidatePath("/[lang]", "layout");
  return { savedAt: Date.now() };
}
