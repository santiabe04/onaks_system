"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  validateDriverForm,
  validateVehicleForm,
  type DriverValues,
  type FormState,
  type VehicleValues,
} from "@/lib/fleet";
import { isCuid } from "@/lib/ids";

// Drivers and vehicles: delivery data. No deletion: they are deactivated
// (later they will be referenced by route sheets).
const PERMISSION = "routes:manage";

function messages() {
  return getActionDictionary().fleet.errors;
}

/** An invalid value discovered through the DB (duplicate, unsuitable user). */
class FleetError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

function isUniqueError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

// --- Drivers ---

const DRIVERS_PATH = "/admin/drivers";

/** The linked user must be internal (Admin or Driver), active and free. */
async function checkDriverUser(
  tx: Prisma.TransactionClient,
  userId: string | null,
  driverId: string | null,
) {
  if (!userId) return;
  const t = messages();
  const user = await tx.user.findFirst({
    where: {
      id: userId,
      isActive: true,
      deletedAt: null,
      userType: { in: ["ADMIN", "DRIVER"] },
    },
    select: { driver: { select: { id: true } } },
  });
  if (!user) throw new FleetError("userId", t.userInvalid);
  if (user.driver && user.driver.id !== driverId) {
    throw new FleetError("userId", t.userTaken);
  }
}

function driverError(
  error: unknown,
  values: DriverValues,
): FormState<DriverValues> {
  const t = messages();
  if (error instanceof FleetError) {
    return { errors: { [error.field]: [error.message] }, values };
  }
  if (isUniqueError(error)) {
    return { errors: { name: [t.duplicateName] }, values };
  }
  if (isNotFound(error)) return { errors: { form: [t.notFound] }, values };
  throw error;
}

export async function saveDriver(
  id: string | null,
  _prev: FormState<DriverValues>,
  formData: FormData,
): Promise<FormState<DriverValues>> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  if (id !== null && !isCuid(id)) return { errors: { form: [t.invalid] } };

  const result = validateDriverForm(formData, t);
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      await checkDriverUser(tx, result.data.userId, id);
      if (id === null) {
        const driver = await tx.driver.create({
          data: { ...result.data, createdById: user.id, updatedById: user.id },
        });
        await audit(tx, {
          action: "CREATE",
          actorUserId: user.id,
          entityType: "DRIVER",
          entityId: driver.id,
          after: driver,
        });
      } else {
        const before = await tx.driver.findUniqueOrThrow({ where: { id } });
        const after = await tx.driver.update({
          where: { id },
          data: { ...result.data, updatedById: user.id },
        });
        await audit(tx, {
          action: "UPDATE",
          actorUserId: user.id,
          entityType: "DRIVER",
          entityId: id,
          before,
          after,
        });
      }
    });
  } catch (error) {
    return driverError(error, result.values);
  }

  revalidatePath("/[lang]/admin/drivers", "page");
  redirect(DRIVERS_PATH);
}

// --- Vehicles ---

const VEHICLES_PATH = "/admin/vehicles";

function vehicleError(
  error: unknown,
  values: VehicleValues,
): FormState<VehicleValues> {
  const t = messages();
  if (error instanceof FleetError) {
    return { errors: { [error.field]: [error.message] }, values };
  }
  if (isNotFound(error)) return { errors: { form: [t.notFound] }, values };
  throw error;
}

export async function saveVehicle(
  id: string | null,
  _prev: FormState<VehicleValues>,
  formData: FormData,
): Promise<FormState<VehicleValues>> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  if (id !== null && !isCuid(id)) return { errors: { form: [t.invalid] } };

  const result = validateVehicleForm(formData, t);
  if (!result.ok) return result.state;
  const data = result.data;

  try {
    await db.$transaction(async (tx) => {
      // Name and plate are unique: the error is shown on the matching field.
      const others = await tx.vehicle.findMany({
        where: {
          id: id ? { not: id } : undefined,
          OR: [
            { name: data.name },
            ...(data.plate ? [{ plate: data.plate }] : []),
          ],
        },
        select: { name: true, plate: true },
      });
      if (others.some((v) => v.name === data.name)) {
        throw new FleetError("name", t.duplicateName);
      }
      if (data.plate && others.some((v) => v.plate === data.plate)) {
        throw new FleetError("plate", t.duplicatePlate);
      }

      if (id === null) {
        const vehicle = await tx.vehicle.create({
          data: { ...data, createdById: user.id, updatedById: user.id },
        });
        await audit(tx, {
          action: "CREATE",
          actorUserId: user.id,
          entityType: "VEHICLE",
          entityId: vehicle.id,
          after: vehicle,
        });
      } else {
        const before = await tx.vehicle.findUniqueOrThrow({ where: { id } });
        const after = await tx.vehicle.update({
          where: { id },
          data: { ...data, updatedById: user.id },
        });
        await audit(tx, {
          action: "UPDATE",
          actorUserId: user.id,
          entityType: "VEHICLE",
          entityId: id,
          before,
          after,
        });
      }
    });
  } catch (error) {
    // A race between the check and the insert: the unique index stops it.
    if (isUniqueError(error)) {
      return { errors: { name: [t.duplicateName] }, values: result.values };
    }
    return vehicleError(error, result.values);
  }

  revalidatePath("/[lang]/admin/vehicles", "page");
  redirect(VEHICLES_PATH);
}
