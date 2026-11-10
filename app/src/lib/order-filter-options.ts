import "server-only";
import { db } from "./db";

/** Options for the order filter selects (list and by-zone view). */
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
    // Paused and deleted ones too: they can be in old orders.
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
