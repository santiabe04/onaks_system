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
  validateWarehouseForm,
  type WarehouseFormState,
  type WarehouseValues,
} from "@/lib/warehouse";

// Each action checks the permission first of all: they can be invoked with a direct POST
// without going through the page or the proxy.
const PERMISSION = "warehouses:manage";
const ENTITY = "WAREHOUSE";

const LIST_PATH = "/admin/warehouses";
// revalidatePath uses the internal route: this way it covers both languages.
const LIST_ROUTE = "/[lang]/admin/warehouses";

/** An attempt was made to deactivate a warehouse that still has stock. */
class HasStockError extends Error {}

function messages() {
  return getActionDictionary().warehouses.errors;
}

function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

/** Known Prisma errors → form state; the rest is rethrown. */
function formError(
  error: unknown,
  values: WarehouseValues,
): WarehouseFormState {
  const t = messages();
  if (error instanceof HasStockError) {
    return { errors: { form: [t.hasStock] }, values };
  }
  const code = prismaErrorCode(error);
  if (code === "P2002") return { errors: { name: [t.duplicate] }, values };
  // P2003: the chosen city does not exist (FK).
  if (code === "P2003") return { errors: { cityId: [t.cityNotFound] }, values };
  if (code === "P2025") return { errors: { form: [t.notFound] }, values };
  throw error;
}

export async function createWarehouse(
  _prev: WarehouseFormState,
  formData: FormData,
): Promise<WarehouseFormState> {
  const user = await requirePermission(PERMISSION);

  const result = validateWarehouseForm(formData, messages());
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.create({
        data: { ...result.data, createdById: user.id, updatedById: user.id },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: warehouse.id,
        after: warehouse,
      });
    });
  } catch (error) {
    return formError(error, result.values);
  }

  revalidatePath(LIST_ROUTE, "page");
  redirect(LIST_PATH);
}

export async function updateWarehouse(
  id: string,
  _prev: WarehouseFormState,
  formData: FormData,
): Promise<WarehouseFormState> {
  const user = await requirePermission(PERMISSION);

  // The id is bound from the client: do not trust the type.
  if (!isCuid(id)) {
    return { errors: { form: [messages().invalid] } };
  }

  const result = validateWarehouseForm(formData, messages());
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      // FOR UPDATE: waits for the movements in progress (which take the row FOR
      // SHARE), so the stock check does not go stale before deactivating.
      await tx.$queryRaw`SELECT "id" FROM "warehouses" WHERE "id" = ${id} FOR UPDATE`;
      // findUniqueOrThrow throws P2025 if it no longer exists, just like the update.
      const before = await tx.warehouse.findUniqueOrThrow({ where: { id } });
      if (before.isActive && !result.data.isActive) {
        // Only deactivated when there is no stock (neither positive nor negative).
        const withStock = await tx.productStock.count({
          where: { warehouseId: id, quantity: { not: 0 } },
        });
        if (withStock > 0) throw new HasStockError();
      }
      const after = await tx.warehouse.update({
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

  revalidatePath(LIST_ROUTE, "page");
  redirect(LIST_PATH);
}

/**
 * A warehouse can only be deleted if it is unused. Once stock movements exist (PR 1.4),
 * their FK prevents it and deactivating is offered instead.
 */
export async function deleteWarehouse(id: string): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  if (!isCuid(id)) {
    return { error: t.invalid };
  }

  try {
    await db.$transaction(async (tx) => {
      const before = await tx.warehouse.delete({ where: { id } });
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
    if (code === "P2003") return { error: t.inUse };
    // P2025: it was already deleted; refreshing the list is enough.
    if (code !== "P2025") throw error;
  }

  revalidatePath(LIST_ROUTE, "page");
  return {};
}
