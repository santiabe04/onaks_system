import "server-only";
import { db } from "./db";
import type { OrderPeriod } from "./order-period";

/**
 * Pedidos de un período listos para `groupOrdersByZone`. Los cancelados no se
 * reparten: quedan fuera. Lo usan la pantalla por zona, el CSV y el dashboard.
 */
export async function getPeriodOrders(
  period: Pick<OrderPeriod, "start" | "end">,
) {
  const sales = await db.sale.findMany({
    where: {
      createdAt: { gte: period.start, lt: period.end },
      state: { not: "CANCELED" },
    },
    orderBy: { number: "asc" },
    select: {
      number: true,
      createdAt: true,
      state: true,
      paymentMethod: true,
      paymentState: true,
      subTotal: true,
      tax: true,
      total: true,
      notes: true,
      address: {
        select: {
          name: true,
          address: true,
          zipCode: true,
          customer: { select: { tradeName: true, cuit: true } },
          city: {
            select: { id: true, name: true, state: { select: { name: true } } },
          },
        },
      },
      items: { select: { quantity: true, unitWeight: true, unitVolume: true } },
    },
  });
  return sales.map((sale) => ({
    ...sale,
    cityId: sale.address.city.id,
    cityName: sale.address.city.name,
    stateName: sale.address.city.state.name,
  }));
}
