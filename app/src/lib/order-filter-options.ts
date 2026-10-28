import "server-only";
import { db } from "./db";

/** Opciones de los selects de filtros de pedidos (lista y vista por zona). */
export async function getOrderFilterOptions() {
  const [customers, cities, products] = await Promise.all([
    db.customer.findMany({
      orderBy: { tradeName: "asc" },
      select: { id: true, tradeName: true },
    }),
    db.city.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // También los pausados y borrados: pueden estar en pedidos viejos.
    db.product.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        measurementUnit: { select: { name: true } },
      },
    }),
  ]);
  return { customers, cities, products };
}

export type OrderFilterOptions = Awaited<
  ReturnType<typeof getOrderFilterOptions>
>;
