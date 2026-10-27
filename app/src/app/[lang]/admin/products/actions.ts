"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DeleteState } from "@/components/ui/delete-button";
import { Prisma } from "@/generated/prisma/client";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  isProductId,
  validateProductForm,
  type ProductField,
  type ProductFormState,
  type ProductInput,
  type ProductValues,
} from "@/lib/product";
import {
  deleteProductImage,
  hasUpload,
  processProductImage,
  saveProductImage,
} from "@/lib/product-image";

// Cada acción verifica el permiso antes que nada: se pueden invocar con un POST
// directo, sin pasar por la página ni por el proxy.
const PERMISSION = "products:manage";
const ENTITY = "PRODUCT";

const LIST_PATH = "/admin/products";
// revalidatePath usa la ruta interna: así cubre los dos idiomas.
const LIST_ROUTE = "/[lang]/admin/products";

function messages() {
  return getActionDictionary().products.errors;
}

function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

/** Error de un campo, para cortar la transacción y mostrarlo en el form. */
class FieldError extends Error {
  constructor(
    readonly field: ProductField | "form",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Valida contra la DB lo que el schema no puede: categoría final, alícuota
 * activa (o la que el producto ya tenía) y unicidad de nombre, SKU y código de
 * barras (también contra productos borrados: la columna es única igual).
 */
async function assertReferences(
  tx: Prisma.TransactionClient,
  data: ProductInput,
  current?: { id: string; taxRateId: number },
) {
  const t = messages();
  // Comparte el lock con el ABM de categorías: mientras se guarda el producto,
  // nadie le agrega una subcategoría a la suya.
  await tx.$executeRaw`LOCK TABLE "categories" IN SHARE MODE`;

  const [category, taxRate, unit, duplicates] = await Promise.all([
    tx.category.findUnique({
      where: { id: data.categoryId },
      select: { _count: { select: { children: true } } },
    }),
    tx.taxRate.findUnique({
      where: { id: data.taxRateId },
      select: { isActive: true },
    }),
    tx.measurementUnit.findUnique({
      where: { id: data.measurementUnitId },
      select: { id: true },
    }),
    tx.product.findMany({
      where: {
        id: current ? { not: current.id } : undefined,
        OR: [
          { name: data.name },
          { sku: data.sku },
          ...(data.barcode ? [{ barcode: data.barcode }] : []),
        ],
      },
      select: { name: true, sku: true, barcode: true },
    }),
  ]);

  if (!category) throw new FieldError("categoryId", t.categoryNotFound);
  if (category._count.children > 0) {
    throw new FieldError("categoryId", t.categoryNotLeaf);
  }
  if (!taxRate) throw new FieldError("taxRateId", t.taxRateRequired);
  if (!taxRate.isActive && data.taxRateId !== current?.taxRateId) {
    throw new FieldError("taxRateId", t.taxRateInactive);
  }
  if (!unit) throw new FieldError("measurementUnitId", t.unitRequired);
  for (const other of duplicates) {
    if (other.sku === data.sku) throw new FieldError("sku", t.duplicateSku);
    if (other.name === data.name) throw new FieldError("name", t.duplicateName);
    if (data.barcode && other.barcode === data.barcode) {
      throw new FieldError("barcode", t.duplicateBarcode);
    }
  }
}

/** Errores conocidos → estado del form; el resto se relanza. */
function formError(error: unknown, values: ProductValues): ProductFormState {
  if (error instanceof FieldError) {
    return { errors: { [error.field]: [error.message] }, values };
  }
  const t = messages();
  const code = prismaErrorCode(error);
  if (code === "P2025") return { errors: { form: [t.notFound] }, values };
  // P2002: otro producto con el mismo dato entró entre el chequeo y el guardado.
  if (code === "P2002") return { errors: { form: [t.duplicate] }, values };
  throw error;
}

/** Procesa la imagen subida, si hay. Un error de imagen se muestra en su campo. */
async function readImage(
  formData: FormData,
): Promise<{ data: Buffer | null } | { error: string }> {
  const file = formData.get("image");
  if (!hasUpload(file)) return { data: null };
  const result = await processProductImage(file);
  return result.ok
    ? { data: result.data }
    : { error: messages()[result.error] };
}

export async function createProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await requirePermission(PERMISSION);

  const result = validateProductForm(formData, messages());
  if (!result.ok) return result.state;
  const image = await readImage(formData);
  if ("error" in image) {
    return { errors: { image: [image.error] }, values: result.values };
  }

  // El archivo se escribe antes de la transacción; si la DB falla, se borra.
  const imageFile = image.data ? await saveProductImage(image.data) : null;
  try {
    await db.$transaction(async (tx) => {
      await assertReferences(tx, result.data);
      const product = await tx.product.create({
        data: {
          ...result.data,
          imageFile,
          createdById: user.id,
          updatedById: user.id,
        },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: product.id,
        after: product,
      });
    });
  } catch (error) {
    await deleteProductImage(imageFile);
    return formError(error, result.values);
  }

  revalidatePath(LIST_ROUTE, "page");
  redirect(LIST_PATH);
}

export async function updateProduct(
  id: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await requirePermission(PERMISSION);

  // El id viene bindeado desde el cliente: no confiar en el tipo.
  if (!isProductId(id)) return { errors: { form: [messages().invalid] } };

  const result = validateProductForm(formData, messages());
  if (!result.ok) return result.state;
  const image = await readImage(formData);
  if ("error" in image) {
    return { errors: { image: [image.error] }, values: result.values };
  }
  const removeImage = formData.get("removeImage") === "on";

  const newFile = image.data ? await saveProductImage(image.data) : null;
  let replacedFile: string | null = null;
  try {
    await db.$transaction(async (tx) => {
      const before = await tx.product.findFirst({
        where: { id, deletedAt: null },
      });
      if (!before) throw new FieldError("form", messages().notFound);
      await assertReferences(tx, result.data, before);

      const imageFile = newFile ?? (removeImage ? null : before.imageFile);
      const after = await tx.product.update({
        where: { id },
        data: { ...result.data, imageFile, updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: id,
        before,
        after,
      });
      if (before.imageFile !== imageFile) replacedFile = before.imageFile;
    });
  } catch (error) {
    await deleteProductImage(newFile);
    return formError(error, result.values);
  }

  // Recién con el cambio confirmado se borra la imagen anterior.
  await deleteProductImage(replacedFile);

  revalidatePath(LIST_ROUTE, "page");
  redirect(LIST_PATH);
}

/**
 * Baja lógica (soft delete): el producto queda para el historial de pedidos y
 * deja de aparecer en el ABM y el catálogo. La imagen se conserva.
 */
export async function deleteProduct(id: string): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  if (!isProductId(id)) return { error: t.invalid };

  await db.$transaction(async (tx) => {
    const before = await tx.product.findFirst({
      where: { id, deletedAt: null },
    });
    // Ya estaba borrado: alcanza con refrescar la lista.
    if (!before) return;
    await tx.product.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: user.id },
    });
    await audit(tx, {
      action: "DELETE",
      actorUserId: user.id,
      entityType: ENTITY,
      entityId: id,
      before,
    });
  });

  revalidatePath(LIST_ROUTE, "page");
  return {};
}
