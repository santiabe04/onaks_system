"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DeleteState } from "@/components/ui/delete-button";
import { Prisma } from "@/generated/prisma/client";
import { interpolate } from "@/i18n/config";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import {
  checkParent,
  MAX_CATEGORY_DEPTH,
  parseCategoryId,
  validateCategoryForm,
  type CategoryFormState,
  type CategoryInput,
  type CategoryValues,
} from "@/lib/category";
import { db } from "@/lib/db";

// Each action checks the permission first of all: they can be invoked with a direct POST,
// without going through the page or the proxy.
const PERMISSION = "categories:manage";
const ENTITY = "CATEGORY";

const LIST_PATH = "/admin/categories";
// revalidatePath uses the internal route: this way it covers both languages.
const LIST_ROUTE = "/[lang]/admin/categories";

function messages() {
  return getActionDictionary().categories.errors;
}

function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

/** Tree validation error, to abort the transaction and show it in the form. */
class TreeError extends Error {
  constructor(
    readonly field: "parentId" | "form",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Validates the parent against the current tree. The lock serializes writes to
 * categories until the end of the transaction: without it, two simultaneous changes
 * (A under B and B under A) could create a cycle. The table is small and
 * only the admin edits it, so the cost is not noticeable.
 */
async function assertValidParent(
  tx: Prisma.TransactionClient,
  id: number | null,
  data: CategoryInput,
) {
  const t = messages();
  await tx.$executeRaw`LOCK TABLE "categories" IN SHARE ROW EXCLUSIVE MODE`;
  const rows = await tx.category.findMany({
    select: { id: true, name: true, parentId: true },
  });
  const error = checkParent(rows, id, data.parentId);
  if (error === "parentNotFound")
    throw new TreeError("parentId", t.parentNotFound);
  if (error === "cycle") throw new TreeError("parentId", t.cycle);
  if (error === "tooDeep") {
    throw new TreeError(
      "parentId",
      interpolate(t.tooDeep, { max: MAX_CATEGORY_DEPTH }),
    );
  }
  // Products go only in leaf categories: one that already has products
  // cannot receive subcategories. (The lock also stops a product that is
  // being added to that category at the same time.)
  if (data.parentId !== null) {
    const products = await tx.product.count({
      where: { categoryId: data.parentId, deletedAt: null },
    });
    if (products > 0) throw new TreeError("parentId", t.parentHasProducts);
  }
}

/** Known errors → form state; the rest is rethrown. */
function formError(error: unknown, values: CategoryValues): CategoryFormState {
  const t = messages();
  if (error instanceof TreeError) {
    return { errors: { [error.field]: [error.message] }, values };
  }
  const code = prismaErrorCode(error);
  if (code === "P2002") return { errors: { name: [t.duplicate] }, values };
  if (code === "P2025") return { errors: { form: [t.notFound] }, values };
  // P2003: the parent was deleted between validation and saving.
  if (code === "P2003") {
    return { errors: { parentId: [t.parentNotFound] }, values };
  }
  throw error;
}

export async function createCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const user = await requirePermission(PERMISSION);

  const result = validateCategoryForm(formData, messages());
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      await assertValidParent(tx, null, result.data);
      const category = await tx.category.create({
        data: { ...result.data, createdById: user.id, updatedById: user.id },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: category.id,
        after: category,
      });
    });
  } catch (error) {
    return formError(error, result.values);
  }

  revalidatePath(LIST_ROUTE, "page");
  redirect(LIST_PATH);
}

export async function updateCategory(
  id: number,
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const user = await requirePermission(PERMISSION);

  // The id is bound from the client: do not trust the type.
  const categoryId = parseCategoryId(id);
  if (categoryId === null) {
    return { errors: { form: [messages().invalid] } };
  }

  const result = validateCategoryForm(formData, messages());
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      // findUniqueOrThrow throws P2025 if it no longer exists, just like the update.
      const before = await tx.category.findUniqueOrThrow({
        where: { id: categoryId },
      });
      await assertValidParent(tx, categoryId, result.data);
      const after = await tx.category.update({
        where: { id: categoryId },
        data: { ...result.data, updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: categoryId,
        before,
        after,
      });
    });
  } catch (error) {
    return formError(error, result.values);
  }

  revalidatePath(LIST_ROUTE, "page");
  redirect(LIST_PATH);
}

// No previous-state parameter: useActionState passes it but it is not used.
export async function deleteCategory(id: number): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  const categoryId = parseCategoryId(id);
  if (categoryId === null) return { error: t.invalid };

  const children = await db.category.count({
    where: { parentId: categoryId },
  });
  if (children > 0) return { error: t.hasChildren };
  // The FK is RESTRICT and includes soft-deleted products: we count all of them.
  const products = await db.product.count({
    where: { categoryId },
  });
  if (products > 0) return { error: t.hasProducts };

  try {
    await db.$transaction(async (tx) => {
      const before = await tx.category.delete({ where: { id: categoryId } });
      await audit(tx, {
        action: "DELETE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: categoryId,
        before,
      });
    });
  } catch (error) {
    const code = prismaErrorCode(error);
    // P2003: a subcategory or product was added between the count and the delete.
    if (code === "P2003") return { error: t.hasProducts };
    // P2025: it was already deleted; refreshing the list is enough.
    if (code !== "P2025") throw error;
  }

  revalidatePath(LIST_ROUTE, "page");
  return {};
}
