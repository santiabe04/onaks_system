import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  canTransition,
  isStepBack,
  pendingReturns,
  stockEffect,
} from "./sale-state";

describe("allowedTransitions", () => {
  it("un pedido pendiente avanza a cualquier estado o se cancela", () => {
    expect(allowedTransitions("PENDING")).toEqual([
      "PREPARING",
      "READY_TO_SHIP",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "FINISHED",
      "CANCELED",
    ]);
  });

  it("vuelve solo un paso atrás", () => {
    const targets = allowedTransitions("OUT_FOR_DELIVERY");
    expect(targets).toContain("READY_TO_SHIP");
    expect(targets).not.toContain("PREPARING");
    expect(targets).not.toContain("PENDING");
  });

  it("se cancela hasta antes de Entregado", () => {
    expect(canTransition("OUT_FOR_DELIVERY", "CANCELED")).toBe(true);
    expect(canTransition("DELIVERED", "CANCELED")).toBe(false);
    expect(canTransition("FINISHED", "CANCELED")).toBe(false);
  });

  it("un finalizado solo vuelve a Entregado y un cancelado es final", () => {
    expect(allowedTransitions("FINISHED")).toEqual(["DELIVERED"]);
    expect(allowedTransitions("CANCELED")).toEqual([]);
  });

  it("no hay cambio al mismo estado", () => {
    expect(canTransition("PREPARING", "PREPARING")).toBe(false);
  });
});

describe("stockEffect", () => {
  it("descuenta al llegar a En preparación, también salteando pasos", () => {
    expect(stockEffect("PENDING", "PREPARING")).toBe("deduct");
    expect(stockEffect("PENDING", "DELIVERED")).toBe("deduct");
  });

  it("devuelve al volver a Pendiente o cancelar después de preparar", () => {
    expect(stockEffect("PREPARING", "PENDING")).toBe("return");
    expect(stockEffect("OUT_FOR_DELIVERY", "CANCELED")).toBe("return");
  });

  it("no toca el stock en el resto de los cambios", () => {
    expect(stockEffect("PENDING", "CANCELED")).toBeNull();
    expect(stockEffect("PREPARING", "READY_TO_SHIP")).toBeNull();
    expect(stockEffect("FINISHED", "DELIVERED")).toBeNull();
  });
});

describe("isStepBack", () => {
  it("distingue retroceder de avanzar o cancelar", () => {
    expect(isStepBack("PREPARING", "PENDING")).toBe(true);
    expect(isStepBack("PENDING", "PREPARING")).toBe(false);
    expect(isStepBack("PREPARING", "CANCELED")).toBe(false);
  });
});

describe("pendingReturns", () => {
  it("devuelve el neto de cada producto y depósito", () => {
    expect(
      pendingReturns([
        // Se preparó desde dos depósitos, volvió, y se preparó otra vez.
        { productId: "prodbolsa15", warehouseId: "depsur", quantity: "-2" },
        { productId: "prodsuelto", warehouseId: "depnorte", quantity: "-1.25" },
        { productId: "prodbolsa15", warehouseId: "depsur", quantity: "2" },
        { productId: "prodsuelto", warehouseId: "depnorte", quantity: "1.25" },
        { productId: "prodbolsa15", warehouseId: "depsur", quantity: "-2" },
        { productId: "prodsuelto", warehouseId: "depsur", quantity: "-1.25" },
      ]),
    ).toEqual([
      { productId: "prodbolsa15", warehouseId: "depsur", quantity: "2" },
      { productId: "prodsuelto", warehouseId: "depsur", quantity: "1.25" },
    ]);
  });

  it("sin movimientos no hay nada que devolver", () => {
    expect(pendingReturns([])).toEqual([]);
  });
});
