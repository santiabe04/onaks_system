import { describe, expect, it } from "vitest";
import { changedFields, parseClientIp, toAuditJson } from "./audit-data";

describe("toAuditJson", () => {
  it("no guarda nada para undefined o null", () => {
    expect(toAuditJson(undefined)).toBeUndefined();
    expect(toAuditJson(null)).toBeUndefined();
  });

  it("pasa fechas a ISO y saca campos sensibles", () => {
    const row = {
      id: "u1",
      passwordHash: "$2b$12$secreto",
      createdAt: new Date("2026-10-27T15:00:00Z"),
      nested: { passwordHash: "x", ok: true },
    };
    expect(toAuditJson(row)).toEqual({
      id: "u1",
      createdAt: "2026-10-27T15:00:00.000Z",
      nested: { ok: true },
    });
  });

  it("usa el toJSON de objetos como Decimal", () => {
    const decimal = { toJSON: () => "12.50" };
    expect(toAuditJson({ price: decimal })).toEqual({ price: "12.50" });
  });
});

describe("changedFields", () => {
  it("devuelve solo lo que cambió, sin updatedAt ni updatedById", () => {
    const before = {
      name: "kg",
      description: "Kilo",
      updatedAt: "a",
      updatedById: "x",
    };
    const after = {
      name: "kg",
      description: "Kilogramo",
      updatedAt: "b",
      updatedById: "y",
    };
    expect(changedFields(before, after)).toEqual([
      { field: "description", before: "Kilo", after: "Kilogramo" },
    ]);
  });

  it("detecta campos que aparecen o desaparecen", () => {
    expect(changedFields({ a: 1 }, { b: 2 })).toEqual([
      { field: "a", before: 1, after: undefined },
      { field: "b", before: undefined, after: 2 },
    ]);
  });

  it("tolera snapshots vacíos", () => {
    expect(changedFields(null, undefined)).toEqual([]);
  });
});

describe("parseClientIp", () => {
  it("toma el primer valor de x-forwarded-for", () => {
    expect(parseClientIp("203.0.113.5, 10.0.0.1", "10.0.0.2")).toBe(
      "203.0.113.5",
    );
  });

  it("usa x-real-ip si no hay x-forwarded-for", () => {
    expect(parseClientIp(null, " 198.51.100.7 ")).toBe("198.51.100.7");
    expect(parseClientIp("  ", "198.51.100.7")).toBe("198.51.100.7");
  });

  it("devuelve null sin datos", () => {
    expect(parseClientIp(null, null)).toBeNull();
  });
});
