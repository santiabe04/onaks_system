"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DeleteState } from "@/components/ui/delete-button";
import { Prisma } from "@/generated/prisma/client";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import {
  validateAddressForm,
  validateCustomerForm,
  validatePersonForm,
  type AddressValues,
  type CustomerValues,
  type FormState,
  type PersonValues,
} from "@/lib/customer";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";

// Cada acción verifica el permiso antes que nada: se pueden invocar con un POST
// directo, sin pasar por la página ni por el proxy.
const PERMISSION = "customers:manage";

const LIST_PATH = "/admin/customers";
// revalidatePath usa la ruta interna: así cubre los dos idiomas.
const ROUTE = "/[lang]/admin/customers";

function messages() {
  return getActionDictionary().customers.errors;
}

function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

/** El cliente (o lo que se edita) ya no existe o está dado de baja. */
class NotFoundError extends Error {}

/** Errores conocidos → estado del form; el resto se relanza. */
function formError<V>(
  error: unknown,
  values: V,
  duplicate?: { field: keyof V; message: string },
): FormState<V> {
  const t = messages();
  // Con V genérico TS no puede comprobar las claves: el cast queda en un lugar.
  const fail = (field: keyof V | "form", message: string): FormState<V> => ({
    errors: { [field]: [message] } as FormState<V>["errors"],
    values,
  });
  if (error instanceof NotFoundError) return fail("form", t.notFound);
  const code = prismaErrorCode(error);
  if (code === "P2002" && duplicate) {
    return fail(duplicate.field, duplicate.message);
  }
  if (code === "P2025") return fail("form", t.notFound);
  throw error;
}

/** Cliente vigente (no dado de baja); si no, corta la transacción. */
async function assertCustomer(
  tx: Prisma.TransactionClient,
  customerId: string,
) {
  const customer = await tx.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) throw new NotFoundError();
}

function revalidateCustomer(customerId: string) {
  revalidatePath(ROUTE, "page");
  revalidatePath(`${ROUTE}/[id]`, "page");
  return `${LIST_PATH}/${customerId}`;
}

// --- Cliente ---

export async function createCustomer(
  _prev: FormState<CustomerValues>,
  formData: FormData,
): Promise<FormState<CustomerValues>> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  const result = validateCustomerForm(formData, t);
  if (!result.ok) return result.state;

  let customerId: string;
  try {
    customerId = await db.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: { ...result.data, createdById: user.id, updatedById: user.id },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: "CUSTOMER",
        entityId: customer.id,
        after: customer,
      });
      return customer.id;
    });
  } catch (error) {
    return formError(error, result.values, {
      field: "cuit",
      message: t.duplicateCuit,
    });
  }

  // Siguiente paso natural: cargar sus personas y direcciones.
  redirect(revalidateCustomer(customerId));
}

export async function updateCustomer(
  id: string,
  _prev: FormState<CustomerValues>,
  formData: FormData,
): Promise<FormState<CustomerValues>> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  // El id viene bindeado desde el cliente: no confiar en el tipo.
  if (!isCuid(id)) return { errors: { form: [t.invalid] } };

  const result = validateCustomerForm(formData, t);
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      const before = await tx.customer.findFirst({
        where: { id, deletedAt: null },
      });
      if (!before) throw new NotFoundError();
      const after = await tx.customer.update({
        where: { id },
        data: { ...result.data, updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "CUSTOMER",
        entityId: id,
        before,
        after,
      });
    });
  } catch (error) {
    return formError(error, result.values, {
      field: "cuit",
      message: t.duplicateCuit,
    });
  }

  redirect(revalidateCustomer(id));
}

/**
 * Baja lógica del cliente junto con sus personas y direcciones: quedan para el
 * historial de pedidos, y sus usuarios ya no pueden entrar (la capa de auth
 * rechaza personas dadas de baja).
 */
export async function deleteCustomer(id: string): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);

  if (!isCuid(id)) return { error: messages().invalid };

  await db.$transaction(async (tx) => {
    const before = await tx.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        persons: { where: { deletedAt: null } },
        addresses: { where: { deletedAt: null } },
      },
    });
    // Ya estaba dado de baja: igual se vuelve a la lista.
    if (!before) return;
    const now = new Date();
    const by = { deletedAt: now, updatedById: user.id };
    await tx.customer.update({ where: { id }, data: by });
    await tx.person.updateMany({
      where: { customerId: id, deletedAt: null },
      data: by,
    });
    await tx.customerAddress.updateMany({
      where: { customerId: id, deletedAt: null },
      data: by,
    });
    await audit(tx, {
      action: "DELETE",
      actorUserId: user.id,
      entityType: "CUSTOMER",
      entityId: id,
      before,
    });
  });

  revalidatePath(ROUTE, "page");
  // Se da de baja desde su propia pantalla: quedarse ahí daría 404.
  redirect(LIST_PATH);
}

// --- Personas ---

export async function savePerson(
  customerId: string,
  personId: string | null,
  _prev: FormState<PersonValues>,
  formData: FormData,
): Promise<FormState<PersonValues>> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  if (!isCuid(customerId) || (personId !== null && !isCuid(personId))) {
    return { errors: { form: [t.invalid] } };
  }

  const result = validatePersonForm(formData, t);
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      await assertCustomer(tx, customerId);
      if (personId === null) {
        const person = await tx.person.create({
          data: {
            ...result.data,
            customerId,
            createdById: user.id,
            updatedById: user.id,
          },
        });
        await audit(tx, {
          action: "CREATE",
          actorUserId: user.id,
          entityType: "PERSON",
          entityId: person.id,
          after: person,
        });
        return;
      }
      // La persona tiene que ser de este cliente: no se edita una ajena por URL.
      const before = await tx.person.findFirst({
        where: { id: personId, customerId, deletedAt: null },
      });
      if (!before) throw new NotFoundError();
      const after = await tx.person.update({
        where: { id: personId },
        data: { ...result.data, updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "PERSON",
        entityId: personId,
        before,
        after,
      });
    });
  } catch (error) {
    return formError(error, result.values, {
      field: "mail",
      message: t.duplicateMail,
    });
  }

  redirect(revalidateCustomer(customerId));
}

export async function deletePerson(
  customerId: string,
  personId: string,
): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);

  if (!isCuid(customerId) || !isCuid(personId)) {
    return { error: messages().invalid };
  }

  await db.$transaction(async (tx) => {
    const before = await tx.person.findFirst({
      where: { id: personId, customerId, deletedAt: null },
    });
    if (!before) return;
    await tx.person.update({
      where: { id: personId },
      data: { deletedAt: new Date(), updatedById: user.id },
    });
    await audit(tx, {
      action: "DELETE",
      actorUserId: user.id,
      entityType: "PERSON",
      entityId: personId,
      before,
    });
  });

  revalidateCustomer(customerId);
  return {};
}

// --- Direcciones de entrega ---

export async function saveAddress(
  customerId: string,
  addressId: string | null,
  _prev: FormState<AddressValues>,
  formData: FormData,
): Promise<FormState<AddressValues>> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  if (!isCuid(customerId) || (addressId !== null && !isCuid(addressId))) {
    return { errors: { form: [t.invalid] } };
  }

  const result = validateAddressForm(formData, t);
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      await assertCustomer(tx, customerId);
      if (addressId === null) {
        const address = await tx.customerAddress.create({
          data: {
            ...result.data,
            customerId,
            createdById: user.id,
            updatedById: user.id,
          },
        });
        await audit(tx, {
          action: "CREATE",
          actorUserId: user.id,
          entityType: "CUSTOMER_ADDRESS",
          entityId: address.id,
          after: address,
        });
        return;
      }
      const before = await tx.customerAddress.findFirst({
        where: { id: addressId, customerId, deletedAt: null },
      });
      if (!before) throw new NotFoundError();
      const after = await tx.customerAddress.update({
        where: { id: addressId },
        data: { ...result.data, updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "CUSTOMER_ADDRESS",
        entityId: addressId,
        before,
        after,
      });
    });
  } catch (error) {
    // P2003: la localidad elegida no existe (FK).
    if (prismaErrorCode(error) === "P2003") {
      return { errors: { cityId: [t.cityNotFound] }, values: result.values };
    }
    return formError(error, result.values);
  }

  redirect(revalidateCustomer(customerId));
}

/** Baja lógica: los pedidos hechos a esa dirección la siguen referenciando. */
export async function deleteAddress(
  customerId: string,
  addressId: string,
): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);

  if (!isCuid(customerId) || !isCuid(addressId)) {
    return { error: messages().invalid };
  }

  await db.$transaction(async (tx) => {
    const before = await tx.customerAddress.findFirst({
      where: { id: addressId, customerId, deletedAt: null },
    });
    if (!before) return;
    await tx.customerAddress.update({
      where: { id: addressId },
      data: { deletedAt: new Date(), updatedById: user.id },
    });
    await audit(tx, {
      action: "DELETE",
      actorUserId: user.id,
      entityType: "CUSTOMER_ADDRESS",
      entityId: addressId,
      before,
    });
  });

  revalidateCustomer(customerId);
  return {};
}
