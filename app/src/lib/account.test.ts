import { describe, expect, it } from "vitest";
import {
  fromCents,
  maxRefund,
  summarizeAccount,
  toCents,
  type AccountPayment,
  type AccountSale,
} from "./account";

// A pet shop's account: food orders that are paid on receipt of the next one.
const sale = (
  number: number,
  total: string,
  state: AccountSale["state"] = "DELIVERED",
): AccountSale => ({ id: `sale${number}`, number, state, total });

const payment = (
  amount: string,
  kind: AccountPayment["kind"] = "PAYMENT",
  voided = false,
): AccountPayment => ({ kind, amount, voided });

describe("summarizeAccount", () => {
  it("sin cobros, lo entregado es deuda y lo no entregado no", () => {
    const summary = summarizeAccount(
      [sale(1, "30000"), sale(2, "15000.50", "PENDING")],
      [],
    );
    expect(summary).toMatchObject({
      balance: "30000.00",
      charged: "30000.00",
      paid: "0.00",
    });
    expect(summary.sales.sale1.paymentState).toBe("PENDING");
    expect(summary.sales.sale2.paymentState).toBe("PENDING");
  });

  it("imputa al pedido más viejo primero y deja el resto parcial", () => {
    const summary = summarizeAccount(
      [sale(2, "20000"), sale(1, "30000")],
      [payment("40000")],
    );
    expect(summary.balance).toBe("10000.00");
    expect(summary.sales.sale1).toEqual({
      paid: "30000.00",
      pending: "0.00",
      paymentState: "PAID",
    });
    expect(summary.sales.sale2).toEqual({
      paid: "10000.00",
      pending: "10000.00",
      paymentState: "PARTIALLY_PAID",
    });
  });

  it("lo que sobra queda a favor y cubre los pedidos no entregados", () => {
    const summary = summarizeAccount(
      [sale(1, "30000"), sale(2, "15000", "PREPARING")],
      [payment("50000")],
    );
    expect(summary.balance).toBe("-20000.00");
    expect(summary.sales.sale2.paymentState).toBe("PAID");
  });

  it("los anulados no cuentan y los reintegros restan", () => {
    const summary = summarizeAccount(
      [sale(1, "30000")],
      [
        payment("50000"),
        payment("5000", "PAYMENT", true),
        payment("20000", "REFUND"),
      ],
    );
    expect(summary.paid).toBe("30000.00");
    expect(summary.balance).toBe("0.00");
    expect(summary.sales.sale1.paymentState).toBe("PAID");
  });

  it("los cancelados no son deuda ni reciben imputación", () => {
    const summary = summarizeAccount(
      [sale(1, "30000", "CANCELED"), sale(2, "10000")],
      [payment("30000")],
    );
    expect(summary.balance).toBe("-20000.00");
    expect(summary.sales.sale1).toBeUndefined();
    expect(summary.sales.sale2.paymentState).toBe("PAID");
  });
});

describe("summarizeAccount con notas de crédito", () => {
  it("una nota de crédito baja la deuda igual que un cobro, al pedido más viejo", () => {
    const summary = summarizeAccount(
      [sale(1, "30000"), sale(2, "20000")],
      [payment("10000")],
      [{ amount: "25000", voided: false }],
    );
    expect(summary).toMatchObject({
      balance: "15000.00",
      charged: "50000.00",
      paid: "10000.00",
      credited: "25000.00",
    });
    expect(summary.sales.sale1.paymentState).toBe("PAID");
    expect(summary.sales.sale2).toEqual({
      paid: "5000.00",
      pending: "15000.00",
      paymentState: "PARTIALLY_PAID",
    });
  });

  it("una anulada no cuenta", () => {
    const summary = summarizeAccount(
      [sale(1, "30000")],
      [],
      [{ amount: "5000", voided: true }],
    );
    expect(summary.balance).toBe("30000.00");
    expect(summary.credited).toBe("0.00");
  });

  it("si supera la deuda, queda saldo a favor y se puede reintegrar", () => {
    const summary = summarizeAccount(
      [sale(1, "30000")],
      [],
      [{ amount: "45000", voided: false }],
    );
    expect(summary.balance).toBe("-15000.00");
    expect(maxRefund(summary.balance)).toBe("15000.00");
    expect(summary.sales.sale1.paymentState).toBe("PAID");
  });

  it("el reintegro de un saldo a favor por nota de crédito deja la cuenta en 0", () => {
    const summary = summarizeAccount(
      [sale(1, "30000")],
      [payment("15000", "REFUND")],
      [{ amount: "45000", voided: false }],
    );
    expect(summary.balance).toBe("0.00");
  });

  it("sin notas de crédito se comporta como siempre", () => {
    expect(
      summarizeAccount([sale(1, "30000")], [payment("10000")]).balance,
    ).toBe("20000.00");
  });
});

describe("maxRefund", () => {
  it("se puede reintegrar solo el saldo a favor", () => {
    expect(maxRefund("-20000.00")).toBe("20000.00");
    expect(maxRefund("10000.00")).toBe("0.00");
  });
});

describe("centavos", () => {
  it("convierte ida y vuelta, también negativos", () => {
    expect(toCents("1234.5")).toBe(BigInt(123450));
    expect(fromCents(toCents("-0.05"))).toBe("-0.05");
    expect(fromCents(BigInt(0))).toBe("0.00");
  });
});
