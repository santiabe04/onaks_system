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
  const admin = { role: "ADMIN" as const };
  const client = { role: "CLIENT" as const };

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
    expect(proxyRedirect("/login", "", admin)).toBe("/admin/measurement-units");
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
});
