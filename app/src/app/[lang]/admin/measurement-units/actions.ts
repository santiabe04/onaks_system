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
  parseUnitId,
  validateMeasurementUnitForm,
  type MeasurementUnitFormState,
} from "@/lib/measurement-unit";

// Cada acción verifica el permiso antes que nada: se pueden invocar con un POST
// directo, sin pasar por la página ni por el proxy.
const PERMISSION = "measurement-units:manage";
const ENTITY = "MEASUREMENT_UNIT";

const LIST_PATH = "/admin/measurement-units";
// revalidatePath usa la ruta interna: así cubre los dos idiomas.
const LIST_ROUTE = "/[lang]/admin/measurement-units";

function messages() {
  return getActionDictionary().measurementUnits.errors;
}

function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

export async function createMeasurementUnit(
  _prev: MeasurementUnitFormState,
  formData: FormData,
): Promise<MeasurementUnitFormState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  const result = validateMeasurementUnitForm(formData, t);
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      const unit = await tx.measurementUnit.create({
        data: { ...result.data, createdById: user.id, updatedById: user.id },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: unit.id,
        after: unit,
      });
    });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002") {
      return { errors: { name: [t.duplicate] }, values: result.values };
    }
    throw error;
  }

  revalidatePath(LIST_ROUTE, "page");
  redirect(LIST_PATH);
}

export async function updateMeasurementUnit(
  id: number,
  _prev: MeasurementUnitFormState,
  formData: FormData,
): Promise<MeasurementUnitFormState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  // El id viene bindeado desde el cliente: no confiar en el tipo.
  const unitId = parseUnitId(id);
  if (unitId === null) return { errors: { form: [t.invalid] } };

  const result = validateMeasurementUnitForm(formData, t);
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      // findUniqueOrThrow tira P2025 si ya no existe, igual que el update.
      const before = await tx.measurementUnit.findUniqueOrThrow({
        where: { id: unitId },
      });
      const after = await tx.measurementUnit.update({
        where: { id: unitId },
        data: { ...result.data, updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: unitId,
        before,
        after,
      });
    });
  } catch (error) {
    const code = prismaErrorCode(error);
    if (code === "P2002") {
      return { errors: { name: [t.duplicate] }, values: result.values };
    }
    if (code === "P2025") {
      return { errors: { form: [t.notFound] }, values: result.values };
    }
    throw error;
  }

  revalidatePath(LIST_ROUTE, "page");
  redirect(LIST_PATH);
}

// Sin parámetro de estado previo: useActionState lo pasa pero no se usa.
export async function deleteMeasurementUnit(id: number): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  const unitId = parseUnitId(id);
  if (unitId === null) return { error: t.invalid };

  // La FK es RESTRICT e incluye productos con soft delete: contamos todos.
  const products = await db.product.count({
    where: { measurementUnitId: unitId },
  });
  if (products > 0) return { error: t.inUse };

  try {
    await db.$transaction(async (tx) => {
      const before = await tx.measurementUnit.delete({ where: { id: unitId } });
      await audit(tx, {
        action: "DELETE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: unitId,
        before,
      });
    });
  } catch (error) {
    const code = prismaErrorCode(error);
    // P2003: se cargó un producto entre el count y el delete.
    if (code === "P2003") return { error: t.inUse };
    // P2025: ya estaba borrada; alcanza con refrescar la lista.
    if (code !== "P2025") throw error;
  }

  revalidatePath(LIST_ROUTE, "page");
  return {};
}
