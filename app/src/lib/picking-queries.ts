import "server-only";
import { db } from "./db";
import type { PickingLine } from "./picking";

/** Una lista de picking con sus pedidos, productos y la ubicación en su depósito. */
export async function getPickingList(number: number) {
  const list = await db.pickingList.findUnique({
    where: { number },
    include: {
      warehouse: { select: { id: true, name: true } },
      createdBy: {
        select: { person: { select: { name: true, surname: true } } },
      },
      confirmedBy: {
        select: { person: { select: { name: true, surname: true } } },
      },
      items: {
        orderBy: [{ sale: { number: "asc" } }, { product: { name: "asc" } }],
        include: {
          sale: {
            select: {
              id: true,
              number: true,
              state: true,
              address: {
                select: { customer: { select: { tradeName: true } } },
              },
            },
          },
          product: {
            select: {
              name: true,
              sku: true,
              measurementUnit: { select: { name: true, allowsDecimals: true } },
              stocks: { select: { warehouseId: true, location: true } },
            },
          },
        },
      },
    },
  });
  if (!list) return null;

  const lines: (PickingLine & {
    customer: string;
    allowsDecimals: boolean;
    picked: { toString(): string } | null;
    shortageReason: string | null;
  })[] = list.items.map((item) => ({
    saleId: item.saleId,
    saleNumber: item.sale.number,
    customer: item.sale.address.customer.tradeName,
    productId: item.productId,
    name: item.product.name,
    sku: item.product.sku,
    unit: item.product.measurementUnit.name,
    allowsDecimals: item.product.measurementUnit.allowsDecimals,
    location:
      item.product.stocks.find(
        (stock) => stock.warehouseId === list.warehouseId,
      )?.location ?? null,
    quantity: item.quantity,
    picked: item.picked,
    shortageReason: item.shortageReason,
  }));
  return { list, lines };
}
