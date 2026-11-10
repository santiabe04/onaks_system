import { z } from "zod";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt only uses the first 72 bytes: a longer one would give a false sense of security.
const MAX_PASSWORD_BYTES = 72;

type Messages = Dictionary["changePassword"]["errors"];

export function changePasswordSchema(t: Messages) {
  const newPassword = z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      interpolate(t.tooShort, { min: MIN_PASSWORD_LENGTH }),
    )
    .refine(
      (value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES,
      interpolate(t.tooLong, { max: MAX_PASSWORD_BYTES }),
    );

  return z
    .object({
      currentPassword: z.string().min(1, t.currentRequired),
      newPassword,
      confirmPassword: z.string(),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      path: ["confirmPassword"],
      message: t.mismatch,
    })
    .refine((data) => data.newPassword !== data.currentPassword, {
      path: ["newPassword"],
      message: t.sameAsCurrent,
    });
}

export type ChangePasswordInput = z.infer<
  ReturnType<typeof changePasswordSchema>
>;

type Field = keyof ChangePasswordInput;

// Without `values`: passwords never go back to the client.
export type ChangePasswordFormState = {
  errors?: Partial<Record<Field | "form", string[]>>;
};

export function validateChangePasswordForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: ChangePasswordInput }
  | { ok: false; state: ChangePasswordFormState } {
  const get = (key: Field) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const parsed = changePasswordSchema(t).safeParse({
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
