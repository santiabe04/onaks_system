"use server";

import { redirect } from "next/navigation";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requireUserForPasswordChange } from "@/lib/auth";
import {
  validateChangePasswordForm,
  type ChangePasswordFormState,
} from "@/lib/change-password";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { homePathFor } from "@/lib/routes";
import { createSession } from "@/lib/session";

export async function changePassword(
  _prev: ChangePasswordFormState,
  formData: FormData,
): Promise<ChangePasswordFormState> {
  const user = await requireUserForPasswordChange();

  const t = getActionDictionary().changePassword.errors;
  const result = validateChangePasswordForm(formData, t);
  if (!result.ok) return result.state;
  const { currentPassword, newPassword } = result.data;

  // The current password is required even with a session: a stolen cookie is not enough
  // to take over the account.
  const stored = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  const valid = await verifyPassword(
    currentPassword,
    stored?.passwordHash ?? null,
  );
  if (!valid) return { errors: { currentPassword: [t.currentWrong] } };

  const passwordHash = await hashPassword(newPassword);
  // Raising the version invalidates the open sessions on other devices.
  const { sessionVersion } = await db.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordMustChange: false,
        sessionVersion: { increment: 1 },
      },
      select: { sessionVersion: true },
    });
    await audit(tx, {
      action: "PASSWORD_CHANGE",
      actorUserId: user.id,
      entityType: "USER",
      entityId: user.id,
      metadata: { forced: user.mustChangePassword },
    });
    return updated;
  });

  // New token with the new version and without the flag: otherwise this session
  // would also be revoked and the proxy would keep sending it back here.
  await createSession({
    userId: user.id,
    role: user.role,
    mustChangePassword: false,
    sessionVersion,
  });
  redirect(homePathFor(user.role));
}
