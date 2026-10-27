import { z } from "zod";

export const loginSchema = z.object({
  mail: z.string().trim().toLowerCase().pipe(z.email("Ingresá un mail válido")),
  password: z
    .string()
    .min(1, "Ingresá la contraseña")
    .max(128, "Contraseña demasiado larga"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** `mail` vuelve al form para no tener que tipearlo de nuevo; la contraseña nunca. */
export type LoginFormState = { error?: string; mail?: string };

export function validateLoginForm(
  formData: FormData,
): { ok: true; data: LoginInput } | { ok: false; state: LoginFormState } {
  const mail = formData.get("mail");
  const password = formData.get("password");
  const parsed = loginSchema.safeParse({
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
