import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { validateChangePasswordForm } from "./change-password";

const t = es.changePassword.errors;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const valid = {
  currentPassword: "admin",
  newPassword: "nueva-segura",
  confirmPassword: "nueva-segura",
};

describe("validateChangePasswordForm", () => {
  it("acepta una contraseña nueva válida", () => {
    expect(validateChangePasswordForm(form(valid), t)).toEqual({
      ok: true,
      data: valid,
    });
  });

  it("exige un largo mínimo", () => {
    const result = validateChangePasswordForm(
      form({ ...valid, newPassword: "corta", confirmPassword: "corta" }),
      t,
    );
    expect(result).toMatchObject({
      ok: false,
      state: { errors: { newPassword: ["Mínimo 8 caracteres"] } },
    });
  });

  it("rechaza más de 72 bytes, el límite de bcrypt", () => {
    // 37 caracteres de 2 bytes = 74 bytes.
    const long = "ñ".repeat(37);
    const result = validateChangePasswordForm(
      form({ ...valid, newPassword: long, confirmPassword: long }),
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors?.newPassword).toBeDefined();
  });

  it("exige que la confirmación coincida", () => {
    const result = validateChangePasswordForm(
      form({ ...valid, confirmPassword: "otra-distinta" }),
      t,
    );
    expect(result).toMatchObject({
      ok: false,
      state: { errors: { confirmPassword: ["Las contraseñas no coinciden"] } },
    });
  });

  it("no deja repetir la contraseña actual", () => {
    const result = validateChangePasswordForm(
      form({
        currentPassword: "misma-clave",
        newPassword: "misma-clave",
        confirmPassword: "misma-clave",
      }),
      t,
    );
    expect(result).toMatchObject({
      ok: false,
      state: {
        errors: { newPassword: ["Tiene que ser distinta de la actual"] },
      },
    });
  });

  it("exige la contraseña actual", () => {
    const result = validateChangePasswordForm(
      form({ ...valid, currentPassword: "" }),
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors?.currentPassword).toEqual([
      "Ingresá tu contraseña actual",
    ]);
  });
});
