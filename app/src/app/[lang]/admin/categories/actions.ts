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

// Cada acción verifica el permiso antes que nada: se pueden invocar con un POST
// directo, sin pasar por la página ni por el proxy.
const PERMISSION = "categories:manage";
const ENTITY = "CATEGORY";

const LIST_PATH = "/admin/categories";
// revalidatePath usa la ruta interna: así cubre los dos idiomas.
const LIST_ROUTE = "/[lang]/admin/categories";

function messages() {
  return getActionDictionary().categories.errors;
}

function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

/** Error de validación del árbol, para cortar la transacción y mostrarlo en el form. */
class TreeError extends Error {
  constructor(
    readonly field: "parentId" | "form",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Valida el padre contra el árbol actual. El lock serializa las escrituras de
 * categorías hasta el fin de la transacción: sin él, dos cambios simultáneos
 * (A debajo de B y B debajo de A) podrían armar un ciclo. La tabla es chica y
 * solo la edita el admin, así que el costo no se nota.
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
  // Los productos van solo en categorías finales: una que ya tiene productos
  // no puede recibir subcategorías. (El lock también frena a un producto que
  // se esté cargando en esa categoría al mismo tiempo.)
  if (data.parentId !== null) {
    const products = await tx.product.count({
      where: { categoryId: data.parentId, deletedAt: null },
    });
    if (products > 0) throw new TreeError("parentId", t.parentHasProducts);
  }
}

/** Errores conocidos → estado del form; el resto se relanza. */
function formError(error: unknown, values: CategoryValues): CategoryFormState {
  const t = messages();
  if (error instanceof TreeError) {
    return { errors: { [error.field]: [error.message] }, values };
  }
  const code = prismaErrorCode(error);
  if (code === "P2002") return { errors: { name: [t.duplicate] }, values };
  if (code === "P2025") return { errors: { form: [t.notFound] }, values };
  // P2003: el padre se borró entre la validación y el guardado.
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

  // El id viene bindeado desde el cliente: no confiar en el tipo.
  const categoryId = parseCategoryId(id);
  if (categoryId === null) {
    return { errors: { form: [messages().invalid] } };
  }

  const result = validateCategoryForm(formData, messages());
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      // findUniqueOrThrow tira P2025 si ya no existe, igual que el update.
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

// Sin parámetro de estado previo: useActionState lo pasa pero no se usa.
export async function deleteCategory(id: number): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  const categoryId = parseCategoryId(id);
  if (categoryId === null) return { error: t.invalid };

  const children = await db.category.count({
    where: { parentId: categoryId },
  });
  if (children > 0) return { error: t.hasChildren };
  // La FK es RESTRICT e incluye productos con soft delete: contamos todos.
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
    // P2003: se agregó una subcategoría o un producto entre el count y el delete.
    if (code === "P2003") return { error: t.hasProducts };
    // P2025: ya estaba borrada; alcanza con refrescar la lista.
    if (code !== "P2025") throw error;
  }

  revalidatePath(LIST_ROUTE, "page");
  return {};
}
