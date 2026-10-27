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
  parseLocationId,
  validateCityForm,
  validateStateForm,
  type CityFormState,
  type StateFormState,
} from "@/lib/location";

// Cada acción verifica el permiso antes que nada: se pueden invocar con un POST
// directo, sin pasar por la página ni por el proxy.
const PERMISSION = "locations:manage";

const LIST_PATH = "/admin/locations";
// revalidatePath usa la ruta interna: así cubre los dos idiomas.
const LIST_ROUTE = "/[lang]/admin/locations";

function messages() {
  return getActionDictionary().locations.errors;
}

function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

// --- Provincias ---

export async function createState(
  _prev: StateFormState,
  formData: FormData,
): Promise<StateFormState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  const result = validateStateForm(formData, t);
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      const state = await tx.state.create({
        data: { ...result.data, createdById: user.id, updatedById: user.id },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: "STATE",
        entityId: state.id,
        after: state,
      });
    });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002") {
      return { errors: { name: [t.duplicateState] }, values: result.values };
    }
    throw error;
  }

  revalidatePath(LIST_ROUTE, "page");
  redirect(LIST_PATH);
}

export async function updateState(
  id: number,
  _prev: StateFormState,
  formData: FormData,
): Promise<StateFormState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  // El id viene bindeado desde el cliente: no confiar en el tipo.
  const stateId = parseLocationId(id);
  if (stateId === null) return { errors: { form: [t.invalid] } };

  const result = validateStateForm(formData, t);
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      // findUniqueOrThrow tira P2025 si ya no existe, igual que el update.
      const before = await tx.state.findUniqueOrThrow({
        where: { id: stateId },
      });
      const after = await tx.state.update({
        where: { id: stateId },
        data: { ...result.data, updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "STATE",
        entityId: stateId,
        before,
        after,
      });
    });
  } catch (error) {
    const code = prismaErrorCode(error);
    if (code === "P2002") {
      return { errors: { name: [t.duplicateState] }, values: result.values };
    }
    if (code === "P2025") {
      return { errors: { form: [t.notFound] }, values: result.values };
    }
    throw error;
  }

  revalidatePath(LIST_ROUTE, "page");
  redirect(LIST_PATH);
}

export async function deleteState(id: number): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  const stateId = parseLocationId(id);
  if (stateId === null) return { error: t.invalid };

  try {
    await db.$transaction(async (tx) => {
      const before = await tx.state.delete({ where: { id: stateId } });
      await audit(tx, {
        action: "DELETE",
        actorUserId: user.id,
        entityType: "STATE",
        entityId: stateId,
        before,
      });
    });
  } catch (error) {
    const code = prismaErrorCode(error);
    // P2003: tiene localidades (FK RESTRICT).
    if (code === "P2003") return { error: t.stateHasCities };
    // P2025: ya estaba borrada; alcanza con refrescar la lista.
    if (code !== "P2025") throw error;
  }

  revalidatePath(LIST_ROUTE, "page");
  return {};
}

// --- Localidades ---

/** Errores conocidos de una localidad → estado del form; el resto se relanza. */
function cityFormError(
  error: unknown,
  values: CityFormState["values"],
): CityFormState {
  const t = messages();
  const code = prismaErrorCode(error);
  if (code === "P2002") return { errors: { name: [t.duplicateCity] }, values };
  // P2003: la provincia elegida no existe (FK).
  if (code === "P2003") {
    return { errors: { stateId: [t.stateNotFound] }, values };
  }
  if (code === "P2025") return { errors: { form: [t.notFound] }, values };
  throw error;
}

export async function createCity(
  _prev: CityFormState,
  formData: FormData,
): Promise<CityFormState> {
  const user = await requirePermission(PERMISSION);

  const result = validateCityForm(formData, messages());
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      const city = await tx.city.create({
        data: { ...result.data, createdById: user.id, updatedById: user.id },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: "CITY",
        entityId: city.id,
        after: city,
      });
    });
  } catch (error) {
    return cityFormError(error, result.values);
  }

  revalidatePath(LIST_ROUTE, "page");
  redirect(LIST_PATH);
}

export async function updateCity(
  id: number,
  _prev: CityFormState,
  formData: FormData,
): Promise<CityFormState> {
  const user = await requirePermission(PERMISSION);

  const cityId = parseLocationId(id);
  if (cityId === null) return { errors: { form: [messages().invalid] } };

  const result = validateCityForm(formData, messages());
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      const before = await tx.city.findUniqueOrThrow({ where: { id: cityId } });
      const after = await tx.city.update({
        where: { id: cityId },
        data: { ...result.data, updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "CITY",
        entityId: cityId,
        before,
        after,
      });
    });
  } catch (error) {
    return cityFormError(error, result.values);
  }

  revalidatePath(LIST_ROUTE, "page");
  redirect(LIST_PATH);
}

export async function deleteCity(id: number): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  const cityId = parseLocationId(id);
  if (cityId === null) return { error: t.invalid };

  try {
    await db.$transaction(async (tx) => {
      const before = await tx.city.delete({ where: { id: cityId } });
      await audit(tx, {
        action: "DELETE",
        actorUserId: user.id,
        entityType: "CITY",
        entityId: cityId,
        before,
      });
    });
  } catch (error) {
    const code = prismaErrorCode(error);
    // P2003: la usan depósitos o direcciones de entrega (FK RESTRICT).
    if (code === "P2003") return { error: t.cityInUse };
    if (code !== "P2025") throw error;
  }

  revalidatePath(LIST_ROUTE, "page");
  return {};
}
