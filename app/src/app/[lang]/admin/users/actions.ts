"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import {
  validatePersonForm,
  type FormState,
  type PersonValues,
} from "@/lib/customer";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { clearLoginFailures } from "@/lib/login-attempts";
import { hashPassword } from "@/lib/password";
import { generateTempPassword } from "@/lib/temp-password";

// Cada acción verifica el permiso antes que nada: se pueden invocar con un POST
// directo, sin pasar por la página ni por el proxy.
const PERMISSION = "users:manage";

/** Resultado de las acciones de usuario. `password` se muestra una sola vez. */
export type UserActionState = { password?: string; error?: string };

function messages() {
  return getActionDictionary().users.errors;
}

/** Las pantallas que muestran usuarios: la de cada cliente y la de admins. */
function revalidateUsers() {
  revalidatePath("/[lang]/admin/customers/[id]", "page");
  revalidatePath("/[lang]/admin/users", "page");
}

/** Error esperable: se muestra junto a los botones, sin romper la pantalla. */
class UserError extends Error {}

/** Usuario vigente (de una persona vigente) para operar sobre él. */
async function findUser(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findFirst({
    where: { id: userId, deletedAt: null, person: { deletedAt: null } },
    include: { person: { select: { mail: true } } },
  });
  if (!user) throw new UserError(messages().notFound);
  return user;
}

async function run(
  work: () => Promise<UserActionState>,
): Promise<UserActionState> {
  try {
    const result = await work();
    revalidateUsers();
    return result;
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };
    throw error;
  }
}

/**
 * Crea el usuario de una persona con una contraseña generada (que hay que
 * cambiar al entrar). El rol sale de la persona: con cliente es CLIENT, sin
 * cliente es ADMIN.
 */
export async function createUser(personId: string): Promise<UserActionState> {
  const admin = await requirePermission(PERMISSION);
  if (!isCuid(personId)) return { error: messages().invalid };

  return run(async () => {
    const password = generateTempPassword();
    const passwordHash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      const person = await tx.person.findFirst({
        where: { id: personId, deletedAt: null },
        include: {
          user: { select: { id: true } },
          customer: { select: { deletedAt: true } },
        },
      });
      if (!person || person.customer?.deletedAt) {
        throw new UserError(messages().notFound);
      }
      if (person.user) throw new UserError(messages().alreadyHasUser);
      const user = await tx.user.create({
        data: {
          personId,
          userType: person.customerId ? "CLIENT" : "ADMIN",
          passwordHash,
          passwordMustChange: true,
        },
      });
      // `audit` saca el hash del snapshot.
      await audit(tx, {
        action: "CREATE",
        actorUserId: admin.id,
        entityType: "USER",
        entityId: user.id,
        after: user,
      });
    });
    return { password };
  });
}

/**
 * Contraseña nueva generada, con cambio obligatorio al entrar. Cierra sus
 * sesiones (session_version) y le saca un bloqueo de login si tenía.
 */
export async function resetPassword(userId: string): Promise<UserActionState> {
  const admin = await requirePermission(PERMISSION);
  if (!isCuid(userId)) return { error: messages().invalid };
  // La propia se cambia con "Cambiar contraseña", pidiendo la actual.
  if (userId === admin.id) return { error: messages().self };

  return run(async () => {
    const password = generateTempPassword();
    const passwordHash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      const user = await findUser(tx, userId);
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          passwordMustChange: true,
          sessionVersion: { increment: 1 },
        },
      });
      await clearLoginFailures(tx, user.person.mail);
      await audit(tx, {
        action: "PASSWORD_RESET",
        actorUserId: admin.id,
        entityType: "USER",
        entityId: userId,
      });
    });
    return { password };
  });
}

/** Desactivar cierra sus sesiones al instante; reactivar no toca la contraseña. */
export async function setUserActive(
  userId: string,
  active: boolean,
): Promise<UserActionState> {
  const admin = await requirePermission(PERMISSION);
  if (!isCuid(userId)) return { error: messages().invalid };
  // Un admin no se desactiva a sí mismo (podría quedar el sistema sin admins).
  if (userId === admin.id) return { error: messages().self };

  return run(async () => {
    await db.$transaction(async (tx) => {
      const before = await findUser(tx, userId);
      const after = await tx.user.update({
        where: { id: userId },
        data: {
          isActive: active,
          ...(active ? {} : { sessionVersion: { increment: 1 } }),
        },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: admin.id,
        entityType: "USER",
        entityId: userId,
        before,
        after,
      });
    });
    return {};
  });
}

/** Libera un bloqueo de login por intentos fallidos antes de los 15 minutos. */
export async function unlockLogin(userId: string): Promise<UserActionState> {
  const admin = await requirePermission(PERMISSION);
  if (!isCuid(userId)) return { error: messages().invalid };

  return run(async () => {
    await db.$transaction(async (tx) => {
      const user = await findUser(tx, userId);
      const cleared = await clearLoginFailures(tx, user.person.mail);
      await audit(tx, {
        action: "LOGIN_UNLOCK",
        actorUserId: admin.id,
        entityType: "USER",
        entityId: userId,
        metadata: { mail: user.person.mail, clearedFailures: cleared },
      });
    });
    return {};
  });
}

/** Estado del alta de admin: el form, o la contraseña generada si salió bien. */
/** Roles de los usuarios internos (los clientes se crean desde su empresa). */
export type InternalRole = "ADMIN" | "DRIVER";

export type AdminFormState = FormState<PersonValues> & {
  password?: string;
  name?: string;
  role?: InternalRole;
};

/**
 * Alta de un usuario interno: persona sin cliente + usuario Admin o
 * Repartidor con contraseña generada.
 */
export async function createAdmin(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requirePermission(PERMISSION);
  const t = getActionDictionary().customers.errors;

  const role: InternalRole =
    formData.get("role") === "DRIVER" ? "DRIVER" : "ADMIN";
  const result = validatePersonForm(formData, t);
  if (!result.ok) return { ...result.state, role };

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);
  try {
    await db.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: {
          ...result.data,
          customerId: null,
          createdById: admin.id,
          updatedById: admin.id,
        },
      });
      const user = await tx.user.create({
        data: {
          personId: person.id,
          userType: role,
          passwordHash,
          passwordMustChange: true,
        },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: admin.id,
        entityType: "PERSON",
        entityId: person.id,
        after: person,
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: admin.id,
        entityType: "USER",
        entityId: user.id,
        after: user,
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { mail: [t.duplicateMail] },
        values: result.values,
        role,
      };
    }
    throw error;
  }

  revalidateUsers();
  return {
    password,
    name: `${result.data.name} ${result.data.surname}`,
  };
}
