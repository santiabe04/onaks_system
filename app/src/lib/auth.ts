import "server-only";
import { redirect } from "next/navigation";
import type { UserType } from "@/generated/prisma/enums";
import { audit } from "./audit";
import { db } from "./db";
import { can, type Permission } from "./permissions";
import { CHANGE_PASSWORD_PATH, homePathFor, LOGOUT_PATH } from "./routes";
import { getSession } from "./session";

export type SessionUser = {
  id: string;
  personId: string;
  customerId: string | null;
  role: UserType;
  name: string;
  mustChangePassword: boolean;
};

// The token only proves who it is. The role and status come from the DB, so a
// deactivation or role change cuts access without waiting for the cookie to expire.
// If `session_version` does not match, the session was revoked (e.g. another
// device changed the password).
async function findSessionUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await db.user.findFirst({
    where: {
      id: session.userId,
      sessionVersion: session.sessionVersion,
      isActive: true,
      deletedAt: null,
      person: { deletedAt: null },
    },
    select: {
      id: true,
      personId: true,
      userType: true,
      passwordMustChange: true,
      person: { select: { name: true, surname: true, customerId: true } },
    },
  });
  if (!user) return null;

  return {
    id: user.id,
    personId: user.personId,
    customerId: user.person.customerId,
    role: user.userType,
    name: `${user.person.name} ${user.person.surname}`,
    mustChangePassword: user.passwordMustChange,
  };
}

/**
 * For rendering: cached per session, so several components on the same
 * page do not repeat the query.
 */
async function findSessionUserCached(): Promise<SessionUser | null> {
  "use cache: private";
  return findSessionUser();
}

/**
 * Sends the user to their home. Only Server Actions record the attempt
 * in the audit log: when rendering, the same page checks several times and the
 * prefetches of the links also render, so one record per render would
 * fill the log with entries the user never asked for.
 */
async function deny(
  user: SessionUser,
  metadata: Record<string, unknown>,
  record: boolean,
): Promise<never> {
  if (record) {
    await audit(db, {
      action: "ACCESS_DENIED",
      actorUserId: user.id,
      metadata,
    });
  }
  redirect(homePathFor(user.role));
}

async function checkAccess(
  user: SessionUser | null,
  role: UserType | undefined,
  record: boolean,
): Promise<SessionUser> {
  // Without a user there may still be a valid token: /logout deletes it before login.
  if (!user) redirect(LOGOUT_PATH);
  // The DB decides: the token may not have the flag (e.g. if the admin set it
  // after login). With a pending password nothing else in the app is used.
  if (user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
  if (role && user.role !== role) {
    await deny(user, { requiredRole: role }, record);
  }
  return user;
}

async function checkPermission(
  user: SessionUser | null,
  permission: Permission,
  record: boolean,
): Promise<SessionUser> {
  const checked = await checkAccess(user, undefined, record);
  if (!can(checked.role, permission)) {
    await deny(checked, { permission }, record);
  }
  return checked;
}

/** For Server Components (inside a <Suspense>). */
export async function getCurrentUser(role?: UserType): Promise<SessionUser> {
  return checkAccess(await findSessionUserCached(), role, false);
}

/** For Server Actions and Route Handlers: always checks against the DB, without cache. */
export async function requireUser(role?: UserType): Promise<SessionUser> {
  return checkAccess(await findSessionUser(), role, true);
}

/**
 * Only to change the password: requires a session but not that the change is already
 * done (otherwise nobody with the flag could meet it).
 */
export async function requireUserForPasswordChange(): Promise<SessionUser> {
  const user = await findSessionUser();
  if (!user) redirect(LOGOUT_PATH);
  return user;
}

/** Like `getCurrentUser`, but requires a permission. For pages. */
export async function getUserWithPermission(
  permission: Permission,
): Promise<SessionUser> {
  return checkPermission(await findSessionUserCached(), permission, false);
}

/**
 * First line of every Server Action that touches protected data. An action can be
 * invoked with a direct POST: the proxy and the UI are not enough.
 */
export async function requirePermission(
  permission: Permission,
): Promise<SessionUser> {
  return checkPermission(await findSessionUser(), permission, true);
}
