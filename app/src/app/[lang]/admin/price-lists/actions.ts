"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DeleteState } from "@/components/ui/delete-button";
import { Prisma } from "@/generated/prisma/client";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import {
  parseFixedPrices,
  validatePriceListForm,
  type PriceListFormState,
  type PriceListValues,
} from "@/lib/price-list";

// Each action checks the permission first of all: they can be invoked with a direct POST
// without going through the page or the proxy.
const PERMISSION = "price-lists:manage";
const ENTITY = "PRICE_LIST";

const LIST_PATH = "/admin/price-lists";
// revalidatePath uses the internal route: this way it covers both languages.
const LIST_ROUTE = "/[lang]/admin/price-lists";

function messages() {
  return getActionDictionary().priceLists.errors;
}

function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

/** Known Prisma errors → form state; the rest is rethrown. */
function formError(
  error: unknown,
  values: PriceListValues,
): PriceListFormState {
  const t = messages();
  const code = prismaErrorCode(error);
  if (code === "P2002") return { errors: { name: [t.duplicate] }, values };
  if (code === "P2025") return { errors: { form: [t.notFound] }, values };
  throw error;
}

/** The list no longer exists: aborts the transaction. */
class NotFoundError extends Error {}

/** Changes what customers see: catalog, cart and new orders. */
function revalidatePrices() {
  revalidatePath("/[lang]", "layout");
}

export async function createPriceList(
  _prev: PriceListFormState,
  formData: FormData,
): Promise<PriceListFormState> {
  const user = await requirePermission(PERMISSION);

  const result = validatePriceListForm(formData, messages());
  if (!result.ok) return result.state;

  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const priceList = await tx.priceList.create({
        data: { ...result.data, createdById: user.id, updatedById: user.id },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: priceList.id,
        after: priceList,
      });
      return priceList.id;
    });
  } catch (error) {
    return formError(error, result.values);
  }

  revalidatePath(LIST_ROUTE, "page");
  // Natural next step: the fixed prices, if needed.
  redirect(`${LIST_PATH}/${id}`);
}

export async function updatePriceList(
  id: string,
  _prev: PriceListFormState,
  formData: FormData,
): Promise<PriceListFormState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  // The id is bound from the client: do not trust the type.
  if (!isCuid(id)) return { errors: { form: [t.invalid] } };

  const result = validatePriceListForm(formData, t);
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      const before = await tx.priceList.findUniqueOrThrow({ where: { id } });
      const after = await tx.priceList.update({
        where: { id },
        data: { ...result.data, updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: id,
        before,
        after,
      });
    });
  } catch (error) {
    return formError(error, result.values);
  }

  revalidatePrices();
  redirect(LIST_PATH);
}

export type FixedPricesState = { error?: string; saved?: boolean };

/**
 * Saves the fixed prices of the list that come in the form: with a price it is
 * created or updated, empty removes it. Audited once with what changed.
 */
export async function saveFixedPrices(
  id: string,
  _prev: FixedPricesState,
  formData: FormData,
): Promise<FixedPricesState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  if (!isCuid(id)) return { error: t.invalid };

  const productIds = [...formData.keys()]
    .filter((key) => key.startsWith("price_"))
    .map((key) => key.slice(6))
    .filter((productId) => isCuid(productId));
  const parsed = parseFixedPrices(formData, productIds, t);
  if (!parsed.ok) return { error: parsed.error };

  try {
    await db.$transaction(async (tx) => {
      // Locks the list: two admins saving at the same time do not overwrite each other halfway.
      const [list] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "price_lists" WHERE "id" = ${id} FOR UPDATE`;
      if (!list) throw new NotFoundError();
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true },
      });
      const existing = new Set(products.map((product) => product.id));
      const before = await tx.priceListItem.findMany({
        where: { priceListId: id },
        select: { productId: true, price: true },
      });
      const current = new Map(
        before.map((item) => [item.productId, item.price.toString()]),
      );

      const changes: {
        productId: string;
        before: string | null;
        after: string | null;
      }[] = [];
      for (const { productId, price } of parsed.prices) {
        if (!existing.has(productId)) continue;
        const previous = current.get(productId) ?? null;
        if (price === null) {
          if (previous === null) continue;
          await tx.priceListItem.delete({
            where: { priceListId_productId: { priceListId: id, productId } },
          });
        } else {
          if (previous !== null && Number(previous) === Number(price)) continue;
          await tx.priceListItem.upsert({
            where: { priceListId_productId: { priceListId: id, productId } },
            create: { priceListId: id, productId, price },
            update: { price },
          });
        }
        changes.push({ productId, before: previous, after: price });
      }
      if (changes.length === 0) return;
      await tx.priceList.update({
        where: { id },
        data: { updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: id,
        metadata: { fixedPrices: changes },
      });
    });
  } catch (error) {
    if (error instanceof NotFoundError) return { error: t.notFound };
    throw error;
  }

  revalidatePrices();
  return { saved: true };
}

// No previous-state parameter: useActionState passes it but it is not used.
export async function deletePriceList(id: string): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  if (!isCuid(id)) return { error: t.invalid };

  try {
    await db.$transaction(async (tx) => {
      const before = await tx.priceList.delete({
        where: { id },
        include: { items: true },
      });
      await audit(tx, {
        action: "DELETE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: id,
        before,
      });
    });
  } catch (error) {
    const code = prismaErrorCode(error);
    // P2003: customers are assigned to it (including the deactivated ones).
    if (code === "P2003") return { error: t.inUse };
    // P2025: it was already deleted; refreshing the list is enough.
    if (code !== "P2025") throw error;
  }

  revalidatePrices();
  return {};
}
