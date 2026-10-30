import { describe, expect, it } from "vitest";
import {
  BASE_PRICING,
  customerPrice,
  listPrice,
  saleDiscount,
  type Pricing,
} from "./customer-price";

const DOG_FOOD = "dogfood15kg";
const LITTER = "litter4kg";

const WHOLESALE: Pricing = {
  adjustment: "-0.1",
  discount: "0",
  overrides: { [LITTER]: "5000" },
};

describe("listPrice", () => {
  it("sin lista es el precio base", () => {
    expect(listPrice(DOG_FOOD, "26000", BASE_PRICING)).toBe("26000.00");
  });

  it("aplica el ajuste de la lista (menos o más) redondeando a centavos", () => {
    expect(listPrice(DOG_FOOD, "26000", WHOLESALE)).toBe("23400.00");
    expect(
      listPrice(DOG_FOOD, "1999.99", { ...BASE_PRICING, adjustment: "0.15" }),
    ).toBe("2299.99"); // 2299.9885
    expect(
      listPrice(DOG_FOOD, "0.05", { ...BASE_PRICING, adjustment: "-0.5" }),
    ).toBe("0.03"); // 0.025: mitad hacia arriba
  });

  it("un precio fijo pisa el ajuste", () => {
    expect(listPrice(LITTER, "5800", WHOLESALE)).toBe("5000.00");
  });
});

describe("customerPrice", () => {
  it("descuenta el porcentaje del cliente sobre el precio de su lista", () => {
    const pricing = { ...WHOLESALE, discount: "0.02" };
    expect(customerPrice(DOG_FOOD, "26000", pricing)).toBe("22932.00");
    expect(customerPrice(LITTER, "5800", pricing)).toBe("4900.00");
  });

  it("sin lista ni descuento queda igual", () => {
    expect(customerPrice(DOG_FOOD, "26000.5", BASE_PRICING)).toBe("26000.50");
  });
});

describe("saleDiscount", () => {
  it("suma la diferencia neta por línea con las cantidades", () => {
    expect(
      saleDiscount([
        { listPrice: "26000", price: "23400", quantity: "2" },
        { listPrice: "4800", price: "4800", quantity: "1.5" },
        { listPrice: "1000", price: "900", quantity: "0.333" },
      ]),
    ).toBe("5233.30");
  });

  it("una lista con recargo no da bonificación negativa", () => {
    expect(
      saleDiscount([{ listPrice: "1000", price: "1150", quantity: "1" }]),
    ).toBe("0.00");
  });
});
