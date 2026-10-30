import "server-only";
import { db } from "./db";

/**
 * Último costo de compra (neto) de cada producto: el más reciente entre sus
 * proveedores. Los que no tienen costo cargado no aparecen. Acepta una
 * transacción para tomar la foto al crear el pedido.
 */
export async function latestCosts(
  productIds: string[],
  client: Pick<typeof db, "supplierProduct"> = db,
): Promise<Record<string, string>> {
  if (productIds.length === 0) return {};
  const rows = await client.supplierProduct.findMany({
    where: { productId: { in: productIds }, lastCost: { not: null } },
    orderBy: [
      { lastCostAt: { sort: "desc", nulls: "last" } },
      { updatedAt: "desc" },
    ],
    select: { productId: true, lastCost: true },
  });
  const costs: Record<string, string> = {};
  for (const row of rows) {
    // Ordenadas del más nuevo al más viejo: queda el primero de cada producto.
    costs[row.productId] ??= row.lastCost!.toString();
  }
  return costs;
}
