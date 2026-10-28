import { describe, expect, it } from "vitest";
import {
  isoDay,
  MAX_RANGE_DAYS,
  parseOrderPeriod,
  periodQuery,
  weekStart,
} from "./order-period";

// Miércoles 28/10/2026 a las 10:00 de Argentina (13:00 UTC).
const NOW = new Date("2026-10-28T13:00:00Z");

describe("weekStart", () => {
  it("la semana empieza el sábado a las 00:00 de Argentina", () => {
    expect(weekStart(NOW).toISOString()).toBe("2026-10-24T03:00:00.000Z");
  });

  it("un sábado es el comienzo de su propia semana", () => {
    const saturday = new Date("2026-10-31T03:00:00Z"); // 00:00 del sábado 31
    expect(weekStart(saturday).toISOString()).toBe(saturday.toISOString());
  });

  it("el viernes a la noche (ya sábado en UTC) sigue siendo la semana anterior", () => {
    const fridayNight = new Date("2026-10-31T02:30:00Z"); // viernes 30, 23:30
    expect(isoDay(weekStart(fridayNight))).toBe("2026-10-24");
  });
});

describe("parseOrderPeriod", () => {
  it("sin parámetros es la semana actual, de sábado a viernes", () => {
    expect(parseOrderPeriod({}, NOW)).toMatchObject({
      mode: "week",
      from: "2026-10-24",
      to: "2026-10-30",
      previousWeek: "2026-10-17",
      nextWeek: "2026-10-31",
    });
  });

  it("?week= acepta cualquier día y lo lleva a su sábado", () => {
    const period = parseOrderPeriod({ week: "2026-11-04" }, NOW);
    expect(period.from).toBe("2026-10-31");
    expect(period.start.toISOString()).toBe("2026-10-31T03:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-11-07T03:00:00.000Z");
  });

  it("un rango libre incluye los dos días", () => {
    const period = parseOrderPeriod(
      { from: "2026-10-01", to: "2026-10-15" },
      NOW,
    );
    expect(period).toMatchObject({
      mode: "range",
      from: "2026-10-01",
      to: "2026-10-15",
    });
    expect(period.end.toISOString()).toBe("2026-10-16T03:00:00.000Z");
  });

  it("da vuelta un rango invertido y completa el extremo que falta", () => {
    expect(
      parseOrderPeriod({ from: "2026-10-15", to: "2026-10-01" }, NOW),
    ).toMatchObject({ from: "2026-10-01", to: "2026-10-15" });
    expect(parseOrderPeriod({ to: "2026-10-05" }, NOW)).toMatchObject({
      from: "2026-10-05",
      to: "2026-10-05",
    });
  });

  it("recorta los rangos demasiado largos", () => {
    const period = parseOrderPeriod(
      { from: "2026-01-01", to: "2026-12-31" },
      NOW,
    );
    const days = (period.end.getTime() - period.start.getTime()) / 86_400_000;
    expect(days).toBe(MAX_RANGE_DAYS);
  });

  it("ignora fechas inválidas", () => {
    expect(parseOrderPeriod({ week: "2026-02-31" }, NOW).from).toBe(
      "2026-10-24",
    );
    expect(parseOrderPeriod({ from: "ayer" }, NOW).mode).toBe("week");
  });
});

describe("periodQuery", () => {
  it("la semana actual no lleva parámetros", () => {
    expect(periodQuery(parseOrderPeriod({}, NOW), NOW)).toBe("");
  });

  it("otra semana y un rango se pueden reproducir", () => {
    expect(
      periodQuery(parseOrderPeriod({ week: "2026-10-17" }, NOW), NOW),
    ).toBe("?week=2026-10-17");
    expect(
      periodQuery(
        parseOrderPeriod({ from: "2026-10-01", to: "2026-10-15" }, NOW),
        NOW,
      ),
    ).toBe("?from=2026-10-01&to=2026-10-15");
  });
});
