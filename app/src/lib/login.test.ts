import { describe, expect, it } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { es } from "@/i18n/dictionaries/es";
import { validateLoginForm } from "./login";

const t = es.login.errors;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("validateLoginForm", () => {
  it("normaliza el mail a minúscula y sin espacios", () => {
    const result = validateLoginForm(
      form({ mail: "  Admin@Onaks.Local ", password: "x" }),
      t,
    );
    expect(result).toEqual({
      ok: true,
      data: { mail: "admin@onaks.local", password: "x" },
    });
  });

  it("no recorta la contraseña", () => {
    const result = validateLoginForm(
      form({ mail: "a@b.com", password: " con espacios " }),
      t,
    );
    expect(result).toMatchObject({ data: { password: " con espacios " } });
  });

  it("rechaza un mail inválido y devuelve lo tipeado", () => {
    const result = validateLoginForm(form({ mail: "nope", password: "x" }), t);
    expect(result).toEqual({
      ok: false,
      state: { error: "Ingresá un mail válido", mail: "nope" },
    });
  });

  it("usa los mensajes del idioma recibido", () => {
    const result = validateLoginForm(
      form({ mail: "nope", password: "x" }),
      en.login.errors,
    );
    expect(result).toMatchObject({ state: { error: "Enter a valid email" } });
  });

  it("exige la contraseña", () => {
    const result = validateLoginForm(form({ mail: "a@b.com" }), t);
    expect(result).toMatchObject({
      ok: false,
      state: { error: "Ingresá la contraseña" },
    });
  });
});
