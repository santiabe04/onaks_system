import { describe, expect, it } from "vitest";
import {
  addDays,
  allocateFefo,
  expiryStatus,
  isValidDay,
  normalizeLotCode,
  returnToLots,
  sumLotsByProduct,
} from "./lots";

const lots = [
  { id: "b", lotCode: "L2", expiresOn: "2026-12-01", quantity: "10" },
  { id: "a", lotCode: "L1", expiresOn: "2026-11-15", quantity: "4" },
  { id: "c", lotCode: "L3", expiresOn: "2027-01-10", quantity: "0" },
];

describe("allocateFefo", () => {
  it("saca primero del lote que vence antes y sigue con el siguiente", () => {
    expect(allocateFefo(lots, "6")).toEqual({
      takes: [
        { lotId: "a", quantity: "4" },
        { lotId: "b", quantity: "2" },
      ],
      rest: "0",
    });
  });

  it("lo que los lotes no cubren queda como stock sin lote", () => {
    expect(allocateFefo(lots, "20.5")).toEqual({
      takes: [
        { lotId: "a", quantity: "4" },
        { lotId: "b", quantity: "10" },
      ],
      rest: "6.5",
    });
  });

  it("ignora los lotes vacíos y a igual fecha ordena por código", () => {
    const tied = [
      { id: "y", lotCode: "B", expiresOn: "2026-11-15", quantity: "1" },
      { id: "x", lotCode: "A", expiresOn: "2026-11-15", quantity: "1" },
    ];
    expect(allocateFefo(tied, "1").takes).toEqual([
      { lotId: "x", quantity: "1" },
    ]);
    expect(allocateFefo([lots[2]], "3")).toEqual({ takes: [], rest: "3" });
  });
});

describe("returnToLots", () => {
  it("devuelve a los lotes de donde salió, sin pasarse", () => {
    const taken = [
      { lotId: "a", quantity: "4" },
      { lotId: "b", quantity: "2" },
    ];
    expect(returnToLots(taken, "5")).toEqual({
      puts: [
        { lotId: "a", quantity: "4" },
        { lotId: "b", quantity: "1" },
      ],
      rest: "0",
    });
    expect(returnToLots(taken, "9").rest).toBe("3");
  });
});

describe("expiryStatus", () => {
  it("distingue vencido, por vencer y en fecha", () => {
    expect(expiryStatus("2026-11-09", "2026-11-10")).toBe("expired");
    expect(expiryStatus("2026-11-10", "2026-11-10")).toBe("soon");
    expect(expiryStatus("2026-12-10", "2026-11-10")).toBe("soon");
    expect(expiryStatus("2026-12-11", "2026-11-10")).toBe("ok");
  });
});

describe("fechas y códigos", () => {
  it("suma días cruzando el fin de mes y de año", () => {
    expect(addDays("2026-12-20", 30)).toBe("2027-01-19");
    expect(addDays("2027-02-20", 10)).toBe("2027-03-02");
  });

  it("solo acepta fechas reales", () => {
    expect(isValidDay("2026-02-28")).toBe(true);
    expect(isValidDay("2026-02-30")).toBe(false);
    expect(isValidDay("10/11/2026")).toBe(false);
  });

  it("normaliza el código del lote", () => {
    expect(normalizeLotCode("  lote-7a ")).toBe("LOTE-7A");
  });
});

describe("sumLotsByProduct", () => {
  it("suma el mismo lote de varios pedidos y ordena por vencimiento", () => {
    const rows = [
      { productId: "p", lotCode: "N", expiresOn: "2027-01-01", quantity: "3" },
      { productId: "p", lotCode: "V", expiresOn: "2026-10-01", quantity: "2" },
      {
        productId: "p",
        lotCode: "N",
        expiresOn: "2027-01-01",
        quantity: "1.5",
      },
      { productId: "q", lotCode: "Z", expiresOn: "2026-12-12", quantity: "1" },
    ];
    expect(sumLotsByProduct(rows).get("p")).toEqual([
      { code: "V", expiresOn: "2026-10-01", quantity: "2" },
      { code: "N", expiresOn: "2027-01-01", quantity: "4.5" },
    ]);
    expect(sumLotsByProduct(rows).get("q")).toHaveLength(1);
  });
});
