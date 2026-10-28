import { describe, expect, it } from "vitest";
import { generateTempPassword } from "./temp-password";

describe("generateTempPassword", () => {
  it("arma 3 grupos de 4 sin caracteres ambiguos", () => {
    for (let i = 0; i < 50; i++) {
      const password = generateTempPassword();
      expect(password).toMatch(
        /^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){2}$/,
      );
    }
  });

  it("descarta los bytes que sesgarían la distribución", () => {
    // 250 está por encima del último múltiplo de 57 (228): se descarta.
    const bytes = [250, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    const password = generateTempPassword((target) => {
      target.set(bytes);
      return target;
    });
    expect(password).toBe("ABCD-EFGH-JKLM");
  });

  it("no repite contraseñas", () => {
    const passwords = new Set(
      Array.from({ length: 200 }, () => generateTempPassword()),
    );
    expect(passwords.size).toBe(200);
  });
});
