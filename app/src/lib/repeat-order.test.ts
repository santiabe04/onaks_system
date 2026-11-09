import { describe, expect, it } from "vitest";
import { planRepeat, repeatQuantity, type RepeatLine } from "./repeat-order";

const DOG_FOOD = "dogfood15kg";
const CAT_LOOSE = "catfoodloose";
const TOY_BALL = "toyball";

describe("repeatQuantity", () => {
  it("copia la cantidad pedida, a milésimas", () => {
    expect(repeatQuantity("4", false)).toBe("4");
    expect(repeatQuantity("2.5000", true)).toBe("2.5");
    expect(repeatQuantity("1.23456", true)).toBe("1.234");
  });

  it("si la unidad ya no admite fracciones, redondea hacia arriba", () => {
    expect(repeatQuantity("2.5", false)).toBe("3");
    expect(repeatQuantity("2.001", false)).toBe("3");
    expect(repeatQuantity("3", false)).toBe("3");
  });

  it("no suma nada si la cantidad no es positiva", () => {
    expect(repeatQuantity("0", true)).toBeNull();
    expect(repeatQuantity("0.0004", true)).toBeNull();
    expect(repeatQuantity("-1", true)).toBeNull();
  });
});

describe("planRepeat", () => {
  const lines: RepeatLine[] = [
    {
      productId: DOG_FOOD,
      quantity: "4",
      available: true,
      allowsDecimals: false,
    },
    {
      productId: CAT_LOOSE,
      quantity: "12.5",
      available: true,
      allowsDecimals: true,
    },
    {
      productId: TOY_BALL,
      quantity: "3",
      available: false,
      allowsDecimals: false,
    },
  ];

  it("suma lo que se puede comprar y cuenta lo que quedó afuera", () => {
    expect(planRepeat(lines)).toEqual({
      adds: [
        { productId: DOG_FOOD, quantity: "4" },
        { productId: CAT_LOOSE, quantity: "12.5" },
      ],
      omitted: 1,
    });
  });

  it("un pedido sin nada disponible no suma nada", () => {
    expect(
      planRepeat([{ ...lines[2] }, { ...lines[0], available: false }]),
    ).toEqual({ adds: [], omitted: 2 });
  });

  it("un pedido vacío no suma ni omite", () => {
    expect(planRepeat([])).toEqual({ adds: [], omitted: 0 });
  });
});
