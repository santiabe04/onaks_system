import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit";
import { invoicedQuantities, isNewerCost } from "./supplier-invoice";

/**
 * What was invoiced of each product of a PO (non-voided invoices), in the same
 * format as the quantities ("6", "2.5"). Call with the PO locked.
 */
export async function invoicedByProduct(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<Map<string, string>> {
  const invoices = await tx.supplierInvoice.findMany({
    where: {
      purchaseOrderId: orderId,
      state: { not: "ANNULLED" },
    },
    select: {
      state: true,
      items: { select: { productId: true, quantity: true } },
    },
  });
  return invoicedQuantities(invoices);
}

/**
 * With the invoice approved, its cost becomes the supplier's last one for
 * each product (unless there is one from a newer invoice). Audited.
 */
export async function updateLastCosts(
  tx: Prisma.TransactionClient,
  invoice: {
    supplierId: string;
    issueDate: string;
    items: { productId: string; unitCost: { toString(): string } }[];
  },
  userId: string,
): Promise<void> {
  // Noon in Argentina: the date does not change when converted to UTC.
  const at = new Date(`${invoice.issueDate}T12:00:00-03:00`);
  for (const item of invoice.items) {
    const key = { supplierId: invoice.supplierId, productId: item.productId };
    const before = await tx.supplierProduct.findUnique({
      where: { supplierId_productId: key },
    });
    if (!before || !isNewerCost(invoice.issueDate, before.lastCostAt)) {
      continue;
    }
    const after = await tx.supplierProduct.update({
      where: { supplierId_productId: key },
      data: {
        lastCost: item.unitCost.toString(),
        lastCostAt: at,
        updatedById: userId,
      },
    });
    await audit(tx, {
      action: "UPDATE",
      actorUserId: userId,
      entityType: "SUPPLIER_PRODUCT",
      entityId: `${invoice.supplierId}:${item.productId}`,
      before,
      after,
    });
  }
}
