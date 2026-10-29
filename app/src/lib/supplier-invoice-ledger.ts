import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit";
import { invoicedQuantities, isNewerCost } from "./supplier-invoice";

/**
 * Lo facturado de cada producto de una OC (facturas sin anular), en el mismo
 * formato que las cantidades ("6", "2.5"). Llamar con la OC bloqueada.
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
 * Con la factura aprobada, su costo pasa a ser el último del proveedor para
 * cada producto (si no hay uno de una factura más nueva). Auditado.
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
  // Mediodía en Argentina: la fecha no cambia al pasarla a UTC.
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
