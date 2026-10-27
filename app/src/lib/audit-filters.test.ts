import { describe, expect, it } from "vitest";
import { auditQuery, auditWhere, parseAuditFilters } from "./audit-filters";

describe("parseAuditFilters", () => {
  it("lee los filtros válidos", () => {
    expect(
      parseAuditFilters({
        actor: "user_1",
        entity: "MEASUREMENT_UNIT",
        action: "UPDATE",
        from: "2026-10-01",
        to: "2026-10-27",
        page: "3",
      }),
    ).toEqual({
      actor: "user_1",
      entity: "MEASUREMENT_UNIT",
      action: "UPDATE",
      from: "2026-10-01",
      to: "2026-10-27",
      page: 3,
    });
  });

  it("ignora valores inválidos o vacíos", () => {
    expect(
      parseAuditFilters({
        actor: "",
        entity: "NOPE",
        action: "DROP_TABLE",
        from: "27/10/2026",
        to: "2026-13-45",
        page: "-1",
      }),
    ).toEqual({ page: 1 });
  });

  it("con parámetros repetidos usa el primero", () => {
    expect(parseAuditFilters({ action: ["LOGOUT", "LOGIN_SUCCESS"] })).toEqual({
      action: "LOGOUT",
      page: 1,
    });
  });
});

describe("auditWhere", () => {
  it("sin filtros no restringe nada", () => {
    expect(auditWhere({ page: 1 })).toEqual({
      actorUserId: undefined,
      entityType: undefined,
      action: undefined,
      createdAt: undefined,
    });
  });

  it("toma las fechas como días de Argentina, con `hasta` inclusive", () => {
    const where = auditWhere({ from: "2026-10-01", to: "2026-10-27", page: 1 });
    expect(where.createdAt).toEqual({
      gte: new Date("2026-10-01T03:00:00Z"),
      lt: new Date("2026-10-28T03:00:00Z"),
    });
  });

  it("acepta solo una de las fechas", () => {
    expect(auditWhere({ to: "2026-10-27", page: 1 }).createdAt).toEqual({
      gte: undefined,
      lt: new Date("2026-10-28T03:00:00Z"),
    });
  });
});

describe("auditQuery", () => {
  it("conserva los filtros y cambia la página", () => {
    expect(
      auditQuery({ action: "LOGOUT", from: "2026-10-01", page: 1 }, 2),
    ).toBe("?action=LOGOUT&from=2026-10-01&page=2");
  });

  it("la primera página sin filtros no lleva query", () => {
    expect(auditQuery({ page: 3 }, 1)).toBe("");
  });
});
