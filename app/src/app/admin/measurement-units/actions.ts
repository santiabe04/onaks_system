"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  parseUnitId,
  validateMeasurementUnitForm,
  type DeleteMeasurementUnitState,
  type MeasurementUnitFormState,
} from "@/lib/measurement-unit";

// Cada acción verifica el permiso antes que nada: se pueden invocar con un POST
// directo, sin pasar por la página ni por el proxy.
const PERMISSION = "measurement-units:manage";

const LIST_PATH = "/admin/measurement-units";
const DUPLICATE_NAME = "Ya existe una unidad con ese nombre";

function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

export async function createMeasurementUnit(
  _prev: MeasurementUnitFormState,
  formData: FormData,
): Promise<MeasurementUnitFormState> {
  await requirePermission(PERMISSION);

  const result = validateMeasurementUnitForm(formData);
  if (!result.ok) return result.state;

  try {
    await db.measurementUnit.create({ data: result.data });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002") {
      return { errors: { name: [DUPLICATE_NAME] }, values: result.values };
    }
    throw error;
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

export async function updateMeasurementUnit(
  id: number,
  _prev: MeasurementUnitFormState,
  formData: FormData,
): Promise<MeasurementUnitFormState> {
  await requirePermission(PERMISSION);

  // El id viene bindeado desde el cliente: no confiar en el tipo.
  const unitId = parseUnitId(id);
  if (unitId === null) return { errors: { form: ["Unidad inválida"] } };

  const result = validateMeasurementUnitForm(formData);
  if (!result.ok) return result.state;

  try {
    await db.measurementUnit.update({
      where: { id: unitId },
      data: result.data,
    });
  } catch (error) {
    const code = prismaErrorCode(error);
    if (code === "P2002") {
      return { errors: { name: [DUPLICATE_NAME] }, values: result.values };
    }
    if (code === "P2025") {
      return {
        errors: { form: ["La unidad ya no existe"] },
        values: result.values,
      };
    }
    throw error;
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

// Sin parámetro de estado previo: useActionState lo pasa pero no se usa.
export async function deleteMeasurementUnit(
  id: number,
): Promise<DeleteMeasurementUnitState> {
  await requirePermission(PERMISSION);

  const unitId = parseUnitId(id);
  if (unitId === null) return { error: "Unidad inválida" };

  // La FK es RESTRICT e incluye productos con soft delete: contamos todos.
  const products = await db.product.count({
    where: { measurementUnitId: unitId },
  });
  if (products > 0) {
    return {
      error: `No se puede borrar: la usa${products === 1 ? "" : "n"} ${products} producto${products === 1 ? "" : "s"}`,
    };
  }

  try {
    await db.measurementUnit.delete({ where: { id: unitId } });
  } catch (error) {
    const code = prismaErrorCode(error);
    // P2003: se cargó un producto entre el count y el delete.
    if (code === "P2003") {
      return { error: "No se puede borrar: hay productos que la usan" };
    }
    // P2025: ya estaba borrada; alcanza con refrescar la lista.
    if (code !== "P2025") throw error;
  }

  revalidatePath(LIST_PATH);
  return {};
}
