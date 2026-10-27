import { z } from "zod";
import type { Dictionary } from "@/i18n/dictionaries/es";

type Messages = Dictionary["login"]["errors"];

export function loginSchema(t: Messages) {
  return z.object({
    mail: z.string().trim().toLowerCase().pipe(z.email(t.invalidMail)),
    password: z.string().min(1, t.passwordRequired).max(128, t.passwordTooLong),
  });
}

export type LoginInput = z.infer<ReturnType<typeof loginSchema>>;

/** `mail` vuelve al form para no tener que tipearlo de nuevo; la contraseña nunca. */
export type LoginFormState = { error?: string; mail?: string };

export function validateLoginForm(
  formData: FormData,
  t: Messages,
): { ok: true; data: LoginInput } | { ok: false; state: LoginFormState } {
  const mail = formData.get("mail");
  const password = formData.get("password");
  const parsed = loginSchema(t).safeParse({
    mail: typeof mail === "string" ? mail : "",
    password: typeof password === "string" ? password : "",
  });
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    state: {
      error: parsed.error.issues[0]?.message,
      mail: typeof mail === "string" ? mail : "",
    },
  };
}
