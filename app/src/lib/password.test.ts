import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("acepta la contraseña correcta y rechaza otra", async () => {
    const hash = await hashPassword("secreta");
    expect(hash).not.toBe("secreta");
    expect(await verifyPassword("secreta", hash)).toBe(true);
    expect(await verifyPassword("Secreta", hash)).toBe(false);
  });

  it("sin hash (user inexistente) siempre es false", async () => {
    expect(await verifyPassword("cualquiera", null)).toBe(false);
  });
});
