import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  planMovement,
  validateMovementForm,
  type MovementInput,
} from "./stock";

const t = es.stock.errors;
const PRODUCT = "c4fvs2r1srhx4gwrri4k0pq0"; // Alimento balanceado perro adulto 15 kg
const CENTRAL = "x6x0uzz02a26bhdgg5kk343s";
const SUR = "k2m9v8q1w0e7r6t5y4u3i2o1";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const base = {
  productId: PRODUCT,
  warehouseId: CENTRAL,
  toWarehouseId: "",
  comment: "",
};

describe("validateMovementForm", () => {
  it("un ingreso acepta decimales con coma y comentario opcional", () => {
    expect(
      validateMovementForm(
        form({ ...base, type: "ENTRY", quantity: "12,5" }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: {
        type: "ENTRY",
        quantity: "12.5",
        comment: null,
        toWarehouseId: null,
      },
    });
  });

  it("ajustes y bajas exigen comentario", () => {
    for (const type of ["ADJUSTMENT", "WRITE_OFF"]) {
      const result = validateMovementForm(
        form({ ...base, type, quantity: "3" }),
        t,
      );
      expect(result).toMatchObject({
        ok: false,
        state: { errors: { comment: [t.commentRequired] } },
      });
    }
  });

  it("un ajuste acepta contar 0, el resto necesita una cantidad positiva", () => {
    expect(
      validateMovementForm(
        form({
          ...base,
          type: "ADJUSTMENT",
          quantity: "0",
          comment: "Conteo mensual",
        }),
        t,
      ).ok,
    ).toBe(true);
    expect(
      validateMovementForm(form({ ...base, type: "ENTRY", quantity: "0" }), t),
    ).toMatchObject({
      ok: false,
      state: { errors: { quantity: [t.quantityInvalid] } },
    });
  });

  it("una transferencia necesita otro depósito de destino", () => {
    expect(
      validateMovementForm(
        form({
          ...base,
          type: "TRANSFER",
          quantity: "5",
          toWarehouseId: CENTRAL,
        }),
        t,
      ),
    ).toMatchObject({
      ok: false,
      state: { errors: { toWarehouseId: [t.sameWarehouse] } },
    });
    expect(
      validateMovementForm(
        form({ ...base, type: "TRANSFER", quantity: "5", toWarehouseId: SUR }),
        t,
      ),
    ).toMatchObject({ ok: true, data: { toWarehouseId: SUR } });
  });

  it("rechaza tipos que no son manuales (una venta no se carga a mano)", () => {
    expect(
      validateMovementForm(form({ ...base, type: "SALE", quantity: "1" }), t),
    ).toMatchObject({
      ok: false,
      state: { errors: { type: [t.typeRequired] } },
    });
  });
});

describe("planMovement", () => {
  const input = (data: Partial<MovementInput>): MovementInput => ({
    type: "ENTRY",
    productId: PRODUCT,
    warehouseId: CENTRAL,
    toWarehouseId: null,
    quantity: "1",
    comment: null,
    ...data,
  });

  it("ingreso suma y baja resta, y el stock puede quedar negativo", () => {
    expect(planMovement(input({ quantity: "20" }), { from: "5" })).toEqual([
      {
        warehouseId: CENTRAL,
        type: "ENTRY",
        quantity: "20",
        balanceAfter: "25",
      },
    ]);
    expect(
      planMovement(input({ type: "WRITE_OFF", quantity: "2.5" }), {
        from: "1",
      }),
    ).toEqual([
      {
        warehouseId: CENTRAL,
        type: "WRITE_OFF",
        quantity: "-2.5",
        balanceAfter: "-1.5",
      },
    ]);
  });

  it("el ajuste registra la diferencia contra lo contado", () => {
    expect(
      planMovement(input({ type: "ADJUSTMENT", quantity: "37" }), {
        from: "40",
      }),
    ).toEqual([
      {
        warehouseId: CENTRAL,
        type: "ADJUSTMENT",
        quantity: "-3",
        balanceAfter: "37",
      },
    ]);
    // Corrige un negativo.
    expect(
      planMovement(input({ type: "ADJUSTMENT", quantity: "0" }), {
        from: "-4",
      }),
    ).toEqual([
      {
        warehouseId: CENTRAL,
        type: "ADJUSTMENT",
        quantity: "4",
        balanceAfter: "0",
      },
    ]);
  });

  it("un ajuste sin diferencia no registra nada", () => {
    expect(
      planMovement(input({ type: "ADJUSTMENT", quantity: "12.500" }), {
        from: "12.5",
      }),
    ).toBeNull();
  });

  it("la transferencia genera salida y entrada", () => {
    expect(
      planMovement(
        input({ type: "TRANSFER", quantity: "5", toWarehouseId: SUR }),
        {
          from: "8",
          to: "-1",
        },
      ),
    ).toEqual([
      {
        warehouseId: CENTRAL,
        type: "TRANSFER_OUT",
        quantity: "-5",
        balanceAfter: "3",
      },
      {
        warehouseId: SUR,
        type: "TRANSFER_IN",
        quantity: "5",
        balanceAfter: "4",
      },
    ]);
  });
});
