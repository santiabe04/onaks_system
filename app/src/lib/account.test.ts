import { describe, expect, it } from "vitest";
import {
  fromCents,
  maxRefund,
  summarizeAccount,
  toCents,
  type AccountPayment,
  type AccountSale,
} from "./account";

// Cuenta de un pet shop: pedidos de alimento que se pagan al recibir el siguiente.
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
