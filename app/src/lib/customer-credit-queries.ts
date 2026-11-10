import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { isReturnable, type ReturnableLine } from "./customer-credit";
import { db } from "./db";

type Client = Prisma.TransactionClient | typeof db;

/**
 * What can be returned from an order: its lines with what was already returned in
 * valid credit notes. null if the order does not exist; `returnable` says whether it is
 * in a state that can be returned.
 */
export async function returnableLines(client: Client, saleId: string) {
  const sale = await client.sale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      number: true,
      state: true,
      address: { select: { customerId: true } },
      items: {
        select: {
          productId: true,
          quantity: true,
          unitPrice: true,
          unitTaxRate: true,
          product: {
            select: {
              name: true,
              sku: true,
              measurementUnit: { select: { name: true, allowsDecimals: true } },
            },
          },
        },
      },
    },
  });
  if (!sale) return null;
  const previous = await client.customerCreditNoteItem.groupBy({
    by: ["productId"],
    where: { creditNote: { saleId, voidedAt: null } },
    _sum: { quantity: true },
  });
  const returned = new Map(
    previous.map((row) => [row.productId, row._sum.quantity ?? "0"]),
  );
  const lines: (ReturnableLine & {
    name: string;
    sku: string;
    unit: string;
  })[] = sale.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    returned: returned.get(item.productId) ?? "0",
    unitPrice: item.unitPrice,
    unitTaxRate: item.unitTaxRate,
    allowsDecimals: item.product.measurementUnit.allowsDecimals,
    name: item.product.name,
    sku: item.product.sku,
    unit: item.product.measurementUnit.name,
  }));
  return {
    id: sale.id,
    number: sale.number,
    customerId: sale.address.customerId,
    returnable: isReturnable(sale.state),
    lines,
  };
}
