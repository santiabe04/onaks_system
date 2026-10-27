import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt solo usa los primeros 72 bytes: más largo daría una falsa sensación de seguridad.
const MAX_PASSWORD_BYTES = 72;

const newPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Mínimo ${MIN_PASSWORD_LENGTH} caracteres`)
  .refine(
    (value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES,
    "Demasiado larga (máximo 72 bytes)",
  );

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingresá tu contraseña actual"),
    newPassword,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "Tiene que ser distinta de la actual",
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

type Field = keyof ChangePasswordInput;

// Sin `values`: las contraseñas nunca vuelven al cliente.
export type ChangePasswordFormState = {
  errors?: Partial<Record<Field | "form", string[]>>;
};

export function validateChangePasswordForm(
  formData: FormData,
):
  | { ok: true; data: ChangePasswordInput }
  | { ok: false; state: ChangePasswordFormState } {
  const get = (key: Field) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const parsed = changePasswordSchema.safeParse({
    currentPassword: get("currentPassword"),
    newPassword: get("newPassword"),
    confirmPassword: get("confirmPassword"),
  });
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    state: { errors: z.flattenError(parsed.error).fieldErrors },
  };
}
