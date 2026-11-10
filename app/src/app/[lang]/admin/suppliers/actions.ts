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
import { toMilli } from "@/lib/quantity";
import {
  validateSupplierForm,
  validateSupplierProductForm,
  type SupplierFormState,
  type SupplierProductFormState,
  type SupplierValues,
} from "@/lib/supplier";

// Each action checks the permission first of all: they can be invoked with a direct POST
// without going through the page or the proxy.
const PERMISSION = "suppliers:manage";

const LIST_PATH = "/admin/suppliers";
// revalidatePath uses the internal route: this way it covers both languages.
const LIST_ROUTE = "/[lang]/admin/suppliers";

function messages() {
  return getActionDictionary().suppliers.errors;
}

function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

/** Single-field error, to abort the transaction and show it in the form. */
class FieldError extends Error {
  constructor(
    readonly field: "productId" | "form",
    message: string,
  ) {
    super(message);
  }
}

/** Same cost (or both without a cost), comparing the Decimal without floats. */
function sameCost(
  before: { toString(): string } | null | undefined,
  after: string | null,
): boolean {
  if (before == null || after === null)
    return (before == null) === (after === null);
  return toMilli(before) === toMilli(after);
}

/** Known Prisma errors → form state; the rest is rethrown. */
function formError(error: unknown, values: SupplierValues): SupplierFormState {
  const t = messages();
  const code = prismaErrorCode(error);
  if (code === "P2002") return { errors: { cuit: [t.duplicateCuit] }, values };
  // P2003: the chosen city does not exist (FK).
  if (code === "P2003") return { errors: { cityId: [t.cityNotFound] }, values };
  if (code === "P2025") return { errors: { form: [t.notFound] }, values };
  throw error;
}

// --- Supplier ---

export async function createSupplier(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const user = await requirePermission(PERMISSION);

  const result = validateSupplierForm(formData, messages());
  if (!result.ok) return result.state;

  let supplierId: string;
  try {
    supplierId = await db.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: { ...result.data, createdById: user.id, updatedById: user.id },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: "SUPPLIER",
        entityId: supplier.id,
        after: supplier,
      });
      return supplier.id;
    });
  } catch (error) {
    return formError(error, result.values);
  }

  revalidatePath(LIST_ROUTE, "page");
  // Natural next step: load the products it supplies.
  redirect(`${LIST_PATH}/${supplierId}`);
}

export async function updateSupplier(
  id: string,
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const user = await requirePermission(PERMISSION);

  // The id is bound from the client: do not trust the type.
  if (!isCuid(id)) return { errors: { form: [messages().invalid] } };

  const result = validateSupplierForm(formData, messages());
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      // findUniqueOrThrow throws P2025 if it no longer exists, just like the update.
      const before = await tx.supplier.findUniqueOrThrow({ where: { id } });
      const after = await tx.supplier.update({
        where: { id },
        data: { ...result.data, updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "SUPPLIER",
        entityId: id,
        before,
        after,
      });
    });
  } catch (error) {
    return formError(error, result.values);
  }

  revalidatePath(LIST_ROUTE, "layout");
  redirect(`${LIST_PATH}/${id}`);
}

/**
 * Deletes the supplier and its product list (cascade). If it already has purchases
 * or payments, the FKs prevent it and it is told to deactivate instead.
 */
export async function deleteSupplier(id: string): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);

  if (!isCuid(id)) return { error: messages().invalid };

  try {
    await db.$transaction(async (tx) => {
      const before = await tx.supplier.delete({
        where: { id },
        include: { products: true },
      });
      await audit(tx, {
        action: "DELETE",
        actorUserId: user.id,
        entityType: "SUPPLIER",
        entityId: id,
        before,
      });
    });
  } catch (error) {
    const code = prismaErrorCode(error);
    // P2003: it has purchase orders, invoices or payments; it is deactivated instead of deleted.
    if (code === "P2003") return { error: messages().inUse };
    // P2025: it was already deleted; it still goes back to the list.
    if (code !== "P2025") throw error;
  }

  revalidatePath(LIST_ROUTE, "page");
  // Deleted from its own screen: staying there would give a 404.
  redirect(LIST_PATH);
}

// --- Products it supplies ---

/**
 * Adds a product to the supplier or, if it was already there, updates its code and
 * cost. `lastCostAt` changes only if the cost changes.
 */
export async function saveSupplierProduct(
  supplierId: string,
  _prev: SupplierProductFormState,
  formData: FormData,
): Promise<SupplierProductFormState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  if (!isCuid(supplierId)) return { errors: { form: [t.invalid] } };

  const result = validateSupplierProductForm(formData, t);
  if (!result.ok) return result.state;
  const { productId, supplierCode, lastCost } = result.data;

  const key = { supplierId_productId: { supplierId, productId } };
  try {
    await db.$transaction(async (tx) => {
      const [supplier, product, before] = await Promise.all([
        tx.supplier.findUnique({
          where: { id: supplierId },
          select: { id: true },
        }),
        tx.product.findFirst({
          where: { id: productId, deletedAt: null },
          select: { id: true },
        }),
        tx.supplierProduct.findUnique({ where: key }),
      ]);
      if (!supplier) throw new FieldError("form", t.notFound);
      if (!product) throw new FieldError("productId", t.productNotFound);

      const data = {
        supplierCode,
        lastCost,
        lastCostAt: sameCost(before?.lastCost, lastCost)
          ? (before?.lastCostAt ?? null)
          : lastCost === null
            ? null
            : new Date(),
        updatedById: user.id,
      };
      const after = await tx.supplierProduct.upsert({
        where: key,
        create: { supplierId, productId, ...data, createdById: user.id },
        update: data,
      });
      await audit(tx, {
        action: before ? "UPDATE" : "CREATE",
        actorUserId: user.id,
        entityType: "SUPPLIER_PRODUCT",
        entityId: `${supplierId}:${productId}`,
        before: before ?? undefined,
        after,
      });
    });
  } catch (error) {
    if (error instanceof FieldError) {
      return {
        errors: { [error.field]: [error.message] },
        values: result.values,
      };
    }
    throw error;
  }

  revalidatePath(`${LIST_ROUTE}/[id]`, "page");
  // savedAt changes the form's key: it is clean to load the next one.
  return { savedAt: Date.now() };
}

export async function removeSupplierProduct(
  supplierId: string,
  productId: string,
): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);

  if (!isCuid(supplierId) || !isCuid(productId)) {
    return { error: messages().invalid };
  }

  try {
    await db.$transaction(async (tx) => {
      const before = await tx.supplierProduct.delete({
        where: { supplierId_productId: { supplierId, productId } },
      });
      await audit(tx, {
        action: "DELETE",
        actorUserId: user.id,
        entityType: "SUPPLIER_PRODUCT",
        entityId: `${supplierId}:${productId}`,
        before,
      });
    });
  } catch (error) {
    // P2025: it was no longer there; refreshing is enough.
    if (prismaErrorCode(error) !== "P2025") throw error;
  }

  revalidatePath(`${LIST_ROUTE}/[id]`, "page");
  return {};
}
