import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  parseBulkStateChangeForm,
  parseStateChangeForm,
  resolveWarehouses,
} from "./sale-state-form";

const t = es.adminOrders.stateChange.errors;

function form(fields: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of fields) data.append(key, value);
  return data;
}

describe("parseStateChangeForm", () => {
  it("lee estado, depósitos por producto y comentario", () => {
    expect(
      parseStateChangeForm(
        form([
          ["from", "PENDING"],
          ["to", "PREPARING"],
          ["warehouse", "depsur"],
          ["warehouse_prodsuelto", "depnorte"],
          ["warehouse_prodbolsa15", ""],
          ["comment", "  Sale con el primer reparto  "],
        ]),
        t,
      ),
    ).toEqual({
      ok: true,
      data: {
        from: "PENDING",
        to: "PREPARING",
        warehouseId: "depsur",
        itemWarehouses: { prodsuelto: "depnorte" },
        comment: "Sale con el primer reparto",
      },
    });
  });

  it("exige un estado de destino válido", () => {
    expect(
      parseStateChangeForm(
        form([
          ["from", "PENDING"],
          ["to", "LOST"],
        ]),
        t,
      ),
    ).toEqual({ ok: false, error: t.targetRequired });
  });

  it("limita el comentario", () => {
    const result = parseStateChangeForm(
      form([
        ["from", "PENDING"],
        ["to", "CANCELED"],
        ["comment", "a".repeat(201)],
      ]),
      t,
    );
    expect(result).toEqual({ ok: false, error: "Máximo 200 caracteres" });
  });
});

describe("resolveWarehouses", () => {
  it("usa el depósito del producto o, si no, el del pedido", () => {
    expect(
      resolveWarehouses(["prodbolsa15", "prodsuelto"], {
        warehouseId: "depsur",
        itemWarehouses: { prodsuelto: "depnorte" },
      }),
    ).toEqual({ prodbolsa15: "depsur", prodsuelto: "depnorte" });
  });

  it("sin depósito del pedido, todos los productos necesitan el suyo", () => {
    expect(
      resolveWarehouses(["prodbolsa15", "prodsuelto"], {
        warehouseId: null,
        itemWarehouses: { prodsuelto: "depnorte" },
      }),
    ).toBeNull();
  });
});

describe("parseBulkStateChangeForm", () => {
  it("lee los pedidos elegidos con su estado y descarta repetidos e inválidos", () => {
    expect(
      parseBulkStateChangeForm(
        form([
          ["sale", "sale1:READY_TO_SHIP"],
          ["sale", "sale2:PREPARING"],
          ["sale", "sale1:READY_TO_SHIP"],
          ["sale", "../x:PENDING"],
          ["sale", "sale3:LOST"],
          ["to", "OUT_FOR_DELIVERY"],
          ["comment", "Reparto del lunes, zona sur"],
        ]),
        t,
      ),
    ).toEqual({
      ok: true,
      data: {
        sales: [
          { id: "sale1", from: "READY_TO_SHIP" },
          { id: "sale2", from: "PREPARING" },
        ],
        to: "OUT_FOR_DELIVERY",
        warehouseId: null,
        comment: "Reparto del lunes, zona sur",
      },
    });
  });

  it("exige al menos un pedido y un estado de destino", () => {
    expect(parseBulkStateChangeForm(form([["to", "DELIVERED"]]), t)).toEqual({
      ok: false,
      error: t.noneSelected,
    });
    expect(
      parseBulkStateChangeForm(form([["sale", "sale1:PENDING"]]), t),
    ).toEqual({ ok: false, error: t.targetRequired });
  });
});
