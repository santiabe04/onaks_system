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

// Each action checks the permission first of all: they can be invoked with a direct POST
// without going through the page or the proxy.
const PERMISSION = "users:manage";

/** Result of the user actions. `password` is shown only once. */
export type UserActionState = { password?: string; error?: string };

function messages() {
  return getActionDictionary().users.errors;
}

/** The screens that show users: each customer's and the admins'. */
function revalidateUsers() {
  revalidatePath("/[lang]/admin/customers/[id]", "page");
  revalidatePath("/[lang]/admin/users", "page");
}

/** Expected error: shown next to the buttons, without breaking the screen. */
class UserError extends Error {}

/** Active user (of an active person) to operate on. */
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
 * Creates a person's user with a generated password (which must be
 * changed on login). The role comes from the person: with a customer it is CLIENT, without
 * a customer it is ADMIN.
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
      // `audit` strips the hash from the snapshot.
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
 * New generated password, with a forced change on login. Closes its
 * sessions (session_version) and removes a login lock it had, if any.
 */
export async function resetPassword(userId: string): Promise<UserActionState> {
  const admin = await requirePermission(PERMISSION);
  if (!isCuid(userId)) return { error: messages().invalid };
  // Your own is changed with "Change password", asking for the current one.
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

/** Deactivating closes its sessions instantly; reactivating does not touch the password. */
export async function setUserActive(
  userId: string,
  active: boolean,
): Promise<UserActionState> {
  const admin = await requirePermission(PERMISSION);
  if (!isCuid(userId)) return { error: messages().invalid };
  // An admin does not deactivate themselves (the system could be left without admins).
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

/** Releases a login lock from failed attempts before the 15 minutes. */
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

/** Admin creation status: the form, or the generated password if it went well. */
/** Roles of the internal users (customers are created from their company). */
export type InternalRole = "ADMIN" | "DRIVER";

export type AdminFormState = FormState<PersonValues> & {
  password?: string;
  name?: string;
  role?: InternalRole;
};

/**
 * Creation of an internal user: a person without a customer + an Admin or
 * Driver user with a generated password.
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
