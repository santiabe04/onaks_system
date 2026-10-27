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

// Cada acción verifica el permiso antes que nada: se pueden invocar con un POST
// directo, sin pasar por la página ni por el proxy.
const PERMISSION = "warehouses:manage";
const ENTITY = "WAREHOUSE";

const LIST_PATH = "/admin/warehouses";
// revalidatePath usa la ruta interna: así cubre los dos idiomas.
const LIST_ROUTE = "/[lang]/admin/warehouses";

/** Se intentó desactivar un depósito que todavía tiene stock. */
class HasStockError extends Error {}

function messages() {
  return getActionDictionary().warehouses.errors;
}

function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

/** Errores conocidos de Prisma → estado del form; el resto se relanza. */
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
  // P2003: la localidad elegida no existe (FK).
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

  // El id viene bindeado desde el cliente: no confiar en el tipo.
  if (!isCuid(id)) {
    return { errors: { form: [messages().invalid] } };
  }

  const result = validateWarehouseForm(formData, messages());
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      // FOR UPDATE: espera a los movimientos en curso (que toman la fila FOR
      // SHARE), así el chequeo de stock no queda viejo antes de desactivar.
      await tx.$queryRaw`SELECT "id" FROM "warehouses" WHERE "id" = ${id} FOR UPDATE`;
      // findUniqueOrThrow tira P2025 si ya no existe, igual que el update.
      const before = await tx.warehouse.findUniqueOrThrow({ where: { id } });
      if (before.isActive && !result.data.isActive) {
        // Solo se desactiva sin stock (ni positivo ni negativo).
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
 * Solo se puede borrar un depósito sin uso. Cuando existan los movimientos de
 * stock (PR 1.4), su FK lo impide y se ofrece desactivarlo.
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
    // P2025: ya estaba borrado; alcanza con refrescar la lista.
    if (code !== "P2025") throw error;
  }

  revalidatePath(LIST_ROUTE, "page");
  return {};
}
