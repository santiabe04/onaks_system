import { describe, expect, it } from "vitest";
import { proxyRedirect, safeNextPath } from "./routes";

describe("safeNextPath", () => {
  it("acepta rutas internas con query", () => {
    expect(safeNextPath("/admin/measurement-units")).toBe(
      "/admin/measurement-units",
    );
    expect(safeNextPath("/catalogo?page=2")).toBe("/catalogo?page=2");
  });

  it("rechaza URLs externas y variantes que el navegador toma como otro dominio", () => {
    expect(safeNextPath("https://evil.com")).toBeNull();
    expect(safeNextPath("//evil.com")).toBeNull();
    expect(safeNextPath("/\\evil.com")).toBeNull();
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
  });

  it("rechaza vacíos, no-strings y el propio login", () => {
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath("/login")).toBeNull();
    expect(safeNextPath("/login?next=/x")).toBeNull();
    expect(safeNextPath("/logout")).toBeNull();
  });
});

describe("proxyRedirect", () => {
  const admin = { role: "ADMIN" as const, mustChangePassword: false };
  const client = { role: "CLIENT" as const, mustChangePassword: false };
  const driver = { role: "DRIVER" as const, mustChangePassword: false };

  it("el repartidor va a sus repartos y no entra al panel", () => {
    expect(proxyRedirect("/login", "", driver)).toBe("/delivery");
    expect(proxyRedirect("/admin/orders", "", driver)).toBe("/delivery");
    expect(proxyRedirect("/delivery", "", driver)).toBeNull();
  });
  const pending = { role: "ADMIN" as const, mustChangePassword: true };

  it("sin sesión manda al login recordando la ruta", () => {
    expect(proxyRedirect("/admin/measurement-units", "?a=1", null)).toBe(
      "/login?next=%2Fadmin%2Fmeasurement-units%3Fa%3D1",
    );
    expect(proxyRedirect("/", "", null)).toBe("/login");
  });

  it("deja ver el login sin sesión", () => {
    expect(proxyRedirect("/login", "", null)).toBeNull();
  });

  it("deja pasar /logout con o sin sesión (si no, loop con el login)", () => {
    expect(proxyRedirect("/logout", "", null)).toBeNull();
    expect(proxyRedirect("/logout", "", admin)).toBeNull();
  });

  it("con sesión, el login manda al inicio de cada rol", () => {
    expect(proxyRedirect("/login", "", admin)).toBe("/admin");
    expect(proxyRedirect("/login", "", client)).toBe("/");
  });

  it("un cliente no entra a /admin", () => {
    expect(proxyRedirect("/admin", "", client)).toBe("/");
    expect(proxyRedirect("/admin/measurement-units/new", "", client)).toBe("/");
  });

  it("no confunde /administracion con /admin", () => {
    expect(proxyRedirect("/administracion", "", client)).toBeNull();
  });

  it("deja pasar al admin y al cliente en sus rutas", () => {
    expect(proxyRedirect("/admin/measurement-units", "", admin)).toBeNull();
    expect(proxyRedirect("/", "", client)).toBeNull();
  });

  it("con la contraseña pendiente todo lleva a cambiarla", () => {
    expect(proxyRedirect("/admin/measurement-units", "", pending)).toBe(
      "/change-password",
    );
    expect(proxyRedirect("/", "", pending)).toBe("/change-password");
    expect(proxyRedirect("/login", "", pending)).toBe("/change-password");
  });

  it("con la contraseña pendiente se puede cambiarla o salir", () => {
    expect(proxyRedirect("/change-password", "", pending)).toBeNull();
    expect(proxyRedirect("/logout", "", pending)).toBeNull();
  });

  it("sin la marca, /change-password queda para un cambio voluntario", () => {
    expect(proxyRedirect("/change-password", "", client)).toBeNull();
    expect(proxyRedirect("/change-password", "", null)).toBe(
      "/login?next=%2Fchange-password",
    );
  });
});
