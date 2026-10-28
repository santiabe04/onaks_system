import { describe, expect, it } from "vitest";
import { groupOrdersByZone, type ZoneOrderInput } from "./orders-by-zone";

// Pedidos de pet shops del sur del GBA.
const dogFood = { quantity: "2", unitWeight: "15", unitVolume: "40" };
const looseCatFood = { quantity: "1.25", unitWeight: "1", unitVolume: null };

function order(
  number: number,
  city: [number, string],
  total: string,
  items: ZoneOrderInput["items"],
  paymentMethod: ZoneOrderInput["paymentMethod"] = "CASH",
) {
  return {
    number,
    cityId: city[0],
    cityName: city[1],
    stateName: "Buenos Aires",
    paymentMethod,
    total,
    items,
  };
}

const QUILMES: [number, string] = [2, "Quilmes"];
const AVELLANEDA: [number, string] = [1, "Avellaneda"];

describe("groupOrdersByZone", () => {
  const { zones, totals } = groupOrdersByZone([
    order(3, QUILMES, "63511.50", [dogFood, looseCatFood]),
    order(4, AVELLANEDA, "27625.00", [dogFood]),
    order(5, QUILMES, "1000.25", [dogFood], "TRANSFER"),
  ]);

  it("agrupa por localidad, ordenadas por nombre, sin perder el orden de los pedidos", () => {
    expect(zones.map((zone) => zone.cityName)).toEqual([
      "Avellaneda",
      "Quilmes",
    ]);
    expect(zones[1].orders.map((o) => o.number)).toEqual([3, 5]);
  });

  it("calcula peso y volumen de cada pedido", () => {
    expect(zones[1].orders[0]).toMatchObject({ weight: "31.25", volume: "80" });
  });

  it("suma los totales de la zona, también por forma de pago", () => {
    expect(zones[1].totals).toEqual({
      count: 2,
      total: "64511.75",
      byPaymentMethod: { CASH: "63511.50", TRANSFER: "1000.25" },
      weight: "61.25",
      volume: "160",
      missingVolume: true,
    });
    expect(zones[0].totals.missingVolume).toBe(false);
  });

  it("suma los totales del período", () => {
    expect(totals).toMatchObject({
      count: 3,
      total: "92136.75",
      weight: "91.25",
      volume: "240",
    });
  });

  it("sin pedidos no hay zonas", () => {
    expect(groupOrdersByZone([])).toMatchObject({
      zones: [],
      totals: { count: 0, total: "0.00", weight: "0", volume: "0" },
    });
  });
});
