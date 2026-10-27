import { describe, expect, it } from "vitest";
import { validateLoginForm } from "./login";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("validateLoginForm", () => {
  it("normaliza el mail a minúscula y sin espacios", () => {
    const result = validateLoginForm(
      form({ mail: "  Admin@Onaks.Local ", password: "x" }),
    );
    expect(result).toEqual({
      ok: true,
      data: { mail: "admin@onaks.local", password: "x" },
    });
  });

  it("no recorta la contraseña", () => {
    const result = validateLoginForm(
      form({ mail: "a@b.com", password: " con espacios " }),
    );
    expect(result).toMatchObject({ data: { password: " con espacios " } });
  });

  it("rechaza un mail inválido y devuelve lo tipeado", () => {
    const result = validateLoginForm(form({ mail: "nope", password: "x" }));
    expect(result).toEqual({
      ok: false,
      state: { error: "Ingresá un mail válido", mail: "nope" },
    });
  });

  it("exige la contraseña", () => {
    const result = validateLoginForm(form({ mail: "a@b.com" }));
    expect(result).toMatchObject({
      ok: false,
      state: { error: "Ingresá la contraseña" },
    });
  });
});
