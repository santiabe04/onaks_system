import { describe, expect, it } from "vitest";
import { summarizeAccount, type AccountSale } from "./account";
import { checkCredit, creditExposure, isOnCreditHold } from "./credit";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-31T13:00:00Z");

// Veterinaria San Roque: un pedido entregado hace 40 días, otro hace 5 y uno
// pendiente (el que acaba de confirmar).
const sales = [
  {
    id: "old",
    number: 1,
    state: "DELIVERED" as const,
    total: "100000",
    deliveredAt: new Date(NOW.getTime() - 40 * DAY),
  },
  {
    id: "recent",
    number: 2,
    state: "DELIVERED" as const,
    total: "50000",
    deliveredAt: new Date(NOW.getTime() - 5 * DAY),
  },
  {
    id: "new",
    number: 3,
    state: "PENDING" as const,
    total: "30000",
    deliveredAt: null,
  },
];

function account(
  paid: string,
  list: (AccountSale & { deliveredAt: Date | null })[] = sales,
) {
  return summarizeAccount(list, [
    { kind: "PAYMENT", amount: paid, voided: false },
  ]);
}

describe("creditExposure", () => {
  it("es lo pendiente de entregados y abiertos, descontado lo pagado", () => {
    expect(creditExposure(account("60000"))).toBe("120000.00");
  });

  it("con saldo a favor que cubre todo queda en 0", () => {
    expect(creditExposure(account("200000"))).toBe("0.00");
  });

  it("los cancelados no cuentan", () => {
    expect(
      creditExposure(
        account("0", [
          ...sales,
          {
            id: "x",
            number: 4,
            state: "CANCELED",
            total: "99999",
            deliveredAt: null,
          },
        ]),
      ),
    ).toBe("180000.00");
  });
});

describe("checkCredit", () => {
  it("sin límite ni plazo no retiene nada", () => {
    expect(
      checkCredit({
        creditLimit: null,
        paymentTermDays: null,
        summary: account("0"),
        sales,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("retiene si lo que debe con el pedido nuevo supera el límite", () => {
    expect(
      checkCredit({
        creditLimit: "150000",
        paymentTermDays: null,
        summary: account("20000"),
        sales,
        now: NOW,
      }),
    ).toEqual({ limit: { limit: "150000.00", exposure: "160000.00" } });
  });

  it("justo en el límite no retiene", () => {
    expect(
      checkCredit({
        creditLimit: "160000",
        paymentTermDays: null,
        summary: account("20000"),
        sales,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("retiene por deuda vencida: el entregado sin pagar más viejo fuera del plazo", () => {
    expect(
      checkCredit({
        creditLimit: null,
        paymentTermDays: 30,
        summary: account("0"),
        sales,
        now: NOW,
      }),
    ).toEqual({
      overdue: {
        since: sales[0].deliveredAt!.toISOString(),
        termDays: 30,
      },
    });
  });

  it("si el viejo ya está pagado, lo reciente dentro del plazo no retiene", () => {
    expect(
      checkCredit({
        creditLimit: null,
        paymentTermDays: 30,
        summary: account("100000"),
        sales,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("puede fallar por los dos motivos a la vez", () => {
    const reasons = checkCredit({
      creditLimit: "1000",
      paymentTermDays: 3,
      summary: account("0"),
      sales,
      now: NOW,
    });
    expect(reasons?.limit?.exposure).toBe("180000.00");
    expect(reasons?.overdue?.termDays).toBe(3);
  });
});

describe("isOnCreditHold", () => {
  it("retenido mientras no se aprueba", () => {
    expect(isOnCreditHold({ creditHoldAt: NOW, creditReleasedAt: null })).toBe(
      true,
    );
    expect(isOnCreditHold({ creditHoldAt: NOW, creditReleasedAt: NOW })).toBe(
      false,
    );
    expect(isOnCreditHold({ creditHoldAt: null, creditReleasedAt: null })).toBe(
      false,
    );
  });
});
