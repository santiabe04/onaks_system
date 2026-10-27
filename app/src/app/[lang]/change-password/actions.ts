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

  // Se pide la actual aunque haya sesión: una cookie robada no alcanza para
  // quedarse con la cuenta.
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
  // Subir la versión invalida las sesiones abiertas en otros dispositivos.
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

  // Token nuevo con la versión nueva y sin la marca: si no, esta sesión
  // también quedaría revocada y el proxy lo seguiría mandando acá.
  await createSession({
    userId: user.id,
    role: user.role,
    mustChangePassword: false,
    sessionVersion,
  });
  redirect(homePathFor(user.role));
}
