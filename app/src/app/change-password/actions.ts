"use server";

import { redirect } from "next/navigation";
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

  const result = validateChangePasswordForm(formData);
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
  if (!valid) {
    return {
      errors: { currentPassword: ["La contraseña actual no es correcta"] },
    };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      passwordMustChange: false,
    },
  });

  // Token nuevo sin la marca: si no, el proxy lo seguiría mandando acá.
  await createSession({
    userId: user.id,
    role: user.role,
    mustChangePassword: false,
  });
  redirect(homePathFor(user.role));
}
