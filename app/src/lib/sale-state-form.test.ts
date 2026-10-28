import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { parseStateChangeForm, resolveWarehouses } from "./sale-state-form";

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
