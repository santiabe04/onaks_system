import { describe, expect, it } from "vitest";
import { can, canAccessCustomer, PERMISSIONS } from "./permissions";

describe("can", () => {
  it("el admin gestiona el catálogo y ve todos los pedidos", () => {
    expect(can("ADMIN", "measurement-units:manage")).toBe(true);
    expect(can("ADMIN", "products:manage")).toBe(true);
    expect(can("ADMIN", "customers:manage")).toBe(true);
    expect(can("ADMIN", "sales:read-all")).toBe(true);
    expect(can("ADMIN", "audit:read")).toBe(true);
    expect(can("ADMIN", "dashboard:read")).toBe(true);
  });

  it("el cliente solo ve el catálogo y compra", () => {
    const allowed = PERMISSIONS.filter((p) => can("CLIENT", p));
    expect(allowed).toEqual(["sales:create", "catalog:read"]);
  });

  it("el admin no compra a nombre de un cliente", () => {
    expect(can("ADMIN", "sales:create")).toBe(false);
  });
});

describe("canAccessCustomer", () => {
  it("el admin accede a cualquier empresa", () => {
    expect(canAccessCustomer({ role: "ADMIN", customerId: null }, "c_1")).toBe(
      true,
    );
  });

  it("el cliente solo accede a su empresa", () => {
    const client = { role: "CLIENT" as const, customerId: "c_1" };
    expect(canAccessCustomer(client, "c_1")).toBe(true);
    expect(canAccessCustomer(client, "c_2")).toBe(false);
  });

  it("un cliente sin empresa no accede a ninguna", () => {
    expect(canAccessCustomer({ role: "CLIENT", customerId: null }, "c_1")).toBe(
      false,
    );
  });
});
