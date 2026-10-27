"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { validateLoginForm, type LoginFormState } from "@/lib/login";
import { verifyPassword } from "@/lib/password";
import { homePathFor, LOGIN_PATH } from "@/lib/routes";
import { createSession, deleteSession } from "@/lib/session";

// Mismo mensaje para mail inexistente, contraseña mala o usuario dado de baja:
// no hay que revelar cuál de las tres fue.
const INVALID_CREDENTIALS = "Mail o contraseña incorrectos";

export async function login(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const result = validateLoginForm(formData);
  if (!result.ok) return result.state;
  const { mail, password } = result.data;

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

  // Se compara aunque no haya user, para que el tiempo de respuesta sea igual.
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !valid) return { error: INVALID_CREDENTIALS, mail };

  await createSession({
    userId: user.id,
    role: user.userType,
    mustChangePassword: user.passwordMustChange,
  });
  redirect(homePathFor(user.userType));
}

export async function logout() {
  await deleteSession();
  redirect(LOGIN_PATH);
}
