"use server";

import { redirect } from "next/navigation";
import { interpolate } from "@/i18n/config";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getLoginLock } from "@/lib/login-attempts";
import { minutesUntil } from "@/lib/login-throttle";
import { validateLoginForm, type LoginFormState } from "@/lib/login";
import { verifyPassword } from "@/lib/password";
import { getRequestContext } from "@/lib/request-context";
import {
  CHANGE_PASSWORD_PATH,
  homePathFor,
  LOGIN_PATH,
  safeNextPath,
} from "@/lib/routes";
import { createSession, deleteSession, getSession } from "@/lib/session";

export async function login(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const t = getActionDictionary().login.errors;
  const result = validateLoginForm(formData, t);
  if (!result.ok) return result.state;
  const { mail, password } = result.data;
  const { ip } = await getRequestContext();

  // Locked: the password is not checked nor counted as a failure, so continuing
  // to try does not extend the lock.
  const now = new Date();
  const lock = await getLoginLock(mail, ip, now);
  if (lock) {
    await audit(db, {
      action: "LOGIN_LOCKED",
      metadata: { mail, scope: lock.scope, until: lock.until },
    });
    return {
      error: interpolate(t.locked, { minutes: minutesUntil(lock.until, now) }),
      mail,
    };
  }

  const person = await db.person.findUnique({
    where: { mail },
    select: {
      deletedAt: true,
      user: {
        select: {
          id: true,
          userType: true,
          passwordHash: true,
          passwordMustChange: true,
          sessionVersion: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
  });
  const user =
    person?.user &&
    !person.deletedAt &&
    person.user.isActive &&
    !person.user.deletedAt
      ? person.user
      : null;

  // It is compared even if there is no user, so the response time is the same.
  const valid = await verifyPassword(password, user?.passwordHash ?? null);

  if (!user || !valid) {
    // The reason is kept in the audit log (only admins see it). The user always
    // gets the same message: the reason must not be revealed.
    const reason = !person?.user
      ? "unknown_mail"
      : !user
        ? "inactive"
        : "wrong_password";
    await db.$transaction(async (tx) => {
      await tx.loginAttempt.create({ data: { mail, ip, success: false } });
      await audit(tx, {
        action: "LOGIN_FAILURE",
        entityType: person?.user ? "USER" : undefined,
        entityId: person?.user?.id,
        metadata: { mail, reason },
      });
    });
    return { error: t.invalidCredentials, mail };
  }

  await db.$transaction(async (tx) => {
    await tx.loginAttempt.create({ data: { mail, ip, success: true } });
    await audit(tx, {
      action: "LOGIN_SUCCESS",
      actorUserId: user.id,
      entityType: "USER",
      entityId: user.id,
      metadata: { mail },
    });
  });

  await createSession({
    userId: user.id,
    role: user.userType,
    mustChangePassword: user.passwordMustChange,
    sessionVersion: user.sessionVersion,
  });
  // `next` comes from the form: it is validated so as not to redirect outside the site. If the
  // role cannot enter there, the proxy bounces it to its home.
  if (user.passwordMustChange) redirect(CHANGE_PASSWORD_PATH);
  redirect(safeNextPath(formData.get("next")) ?? homePathFor(user.userType));
}

export async function logout() {
  const session = await getSession();
  // The token may belong to a user who no longer exists (e.g. a recreated DB):
  // without this check the audit log's FK would break the logout.
  const user = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        select: { id: true },
      })
    : null;
  if (user) {
    await audit(db, {
      action: "LOGOUT",
      actorUserId: user.id,
      entityType: "USER",
      entityId: user.id,
    });
  }
  await deleteSession();
  redirect(LOGIN_PATH);
}
