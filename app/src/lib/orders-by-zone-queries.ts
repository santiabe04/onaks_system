import "server-only";
import { db } from "./db";
import type { OrderPeriod } from "./order-period";
import { groupOrdersByZone } from "./orders-by-zone";

/**
 * Pedidos del período agrupados por localidad, sin los cancelados (no se
 * reparten). Lo usan la pantalla, el CSV y el dashboard.
 */
export async function getOrdersByZone(
  period: Pick<OrderPeriod, "start" | "end">,
  locale: string,
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
      address: {
        select: {
          name: true,
          address: true,
          customer: { select: { tradeName: true, cuit: true } },
          city: {
            select: { id: true, name: true, state: { select: { name: true } } },
          },
        },
      },
      items: { select: { quantity: true, unitWeight: true, unitVolume: true } },
    },
  });
  return groupOrdersByZone(
    sales.map((sale) => ({
      ...sale,
      cityId: sale.address.city.id,
      cityName: sale.address.city.name,
      stateName: sale.address.city.state.name,
    })),
    locale,
  );
}
