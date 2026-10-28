import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  amountsToCollect,
  checkCapacity,
  moveStop,
  validateRouteSheetForm,
} from "./route-sheet";

const t = es.routes.errors;

describe("moveStop", () => {
  const order = ["petshop", "veterinaria", "almacen"];

  it("sube y baja una parada", () => {
    expect(moveStop(order, "veterinaria", -1)).toEqual([
      "veterinaria",
      "petshop",
      "almacen",
    ]);
    expect(moveStop(order, "veterinaria", 1)).toEqual([
      "petshop",
      "almacen",
      "veterinaria",
    ]);
  });

  it("en la punta, o si no está, queda igual", () => {
    expect(moveStop(order, "petshop", -1)).toBe(order);
    expect(moveStop(order, "almacen", 1)).toBe(order);
    expect(moveStop(order, "otra", 1)).toBe(order);
  });
});

describe("checkCapacity", () => {
  it("avisa solo con la capacidad que tenga cargada el vehículo", () => {
    const kangoo = { capacityKg: "650.5", capacityLiters: null };
    expect(checkCapacity({ weight: "700", volume: "99999" }, kangoo)).toEqual({
      overWeight: true,
      overVolume: false,
    });
    expect(checkCapacity({ weight: "650.5", volume: "0" }, kangoo)).toEqual({
      overWeight: false,
      overVolume: false,
    });
  });

  it("sin vehículo no hay aviso", () => {
    expect(checkCapacity({ weight: "5000", volume: "5000" }, null)).toEqual({
      overWeight: false,
      overVolume: false,
    });
  });
});

describe("amountsToCollect", () => {
  it("suma la deuda anterior una sola vez por cliente", () => {
    expect(
      amountsToCollect([
        {
          stopId: "stop1",
          customerId: "petshop",
          salePending: "27625",
          customerBalance: "2235",
        },
        {
          stopId: "stop2",
          customerId: "veterinaria",
          salePending: "26125",
          customerBalance: "-1500",
        },
        {
          stopId: "stop3",
          customerId: "petshop",
          salePending: "55250",
          customerBalance: "2235",
        },
      ]),
    ).toEqual({
      stop1: { order: "27625.00", previousDebt: "2235.00", total: "29860.00" },
      stop2: { order: "26125.00", previousDebt: "0.00", total: "26125.00" },
      stop3: { order: "55250.00", previousDebt: "0.00", total: "55250.00" },
    });
  });
});

describe("validateRouteSheetForm", () => {
  function form(fields: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }

  it("acepta fecha, repartidor y vehículo opcional", () => {
    expect(
      validateRouteSheetForm(
        form({
          date: "2026-10-31",
          driverId: "driverjuan",
          vehicleId: "",
          notes: " Zona sur ",
        }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: {
        date: "2026-10-31",
        driverId: "driverjuan",
        vehicleId: null,
        notes: "Zona sur",
      },
    });
  });

  it("exige fecha y repartidor", () => {
    const result = validateRouteSheetForm(
      form({ date: "mañana", driverId: "" }),
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors).toMatchObject({
      date: [t.date],
      driverId: [t.driver],
    });
  });
});
