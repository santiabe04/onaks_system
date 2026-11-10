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

// Each action checks the permission first of all: they can be invoked with a direct POST
// without going through the page or the proxy.
const PERMISSION = "measurement-units:manage";
const ENTITY = "MEASUREMENT_UNIT";

const LIST_PATH = "/admin/measurement-units";
// revalidatePath uses the internal route: this way it covers both languages.
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

  // The id is bound from the client: do not trust the type.
  const unitId = parseUnitId(id);
  if (unitId === null) return { errors: { form: [t.invalid] } };

  const result = validateMeasurementUnitForm(formData, t);
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      // findUniqueOrThrow throws P2025 if it no longer exists, just like the update.
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

// No previous-state parameter: useActionState passes it but it is not used.
export async function deleteMeasurementUnit(id: number): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  const unitId = parseUnitId(id);
  if (unitId === null) return { error: t.invalid };

  // The FK is RESTRICT and includes soft-deleted products: we count all of them.
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
    // P2003: a product was added between the count and the delete.
    if (code === "P2003") return { error: t.inUse };
    // P2025: it was already deleted; refreshing the list is enough.
    if (code !== "P2025") throw error;
  }

  revalidatePath(LIST_ROUTE, "page");
  return {};
}
