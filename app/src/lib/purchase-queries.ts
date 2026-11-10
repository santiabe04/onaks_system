import "server-only";
import type { PurchaseOrderState } from "@/generated/prisma/enums";
import { RESERVED_SALE_STATES } from "./checkout";
import { db } from "./db";
import { suggestQuantity } from "./purchase-order";
import { fromMilli, toMilli } from "./quantity";

/** POs still waiting for goods (counts as "already ordered"). */
const OPEN_PO_STATES: PurchaseOrderState[] = ["SENT", "PARTIALLY_RECEIVED"];

/**
 * The supplier's products to build a PO: stock, reserved, minimum,
 * what was already ordered on other POs not yet received, the suggestion and, if the PO already has
 * lines, what was entered. Deleted products are not offered.
 */
export async function getPurchaseLines(
  supplierId: string,
  orderId: string | null,
) {
  const supplied = await db.supplierProduct.findMany({
    where: { supplierId, product: { deletedAt: null } },
    orderBy: { product: { name: "asc" } },
    select: {
      productId: true,
      supplierCode: true,
      lastCost: true,
      product: {
        select: {
          name: true,
          sku: true,
          isActive: true,
          minStock: true,
          taxRate: { select: { rate: true } },
          measurementUnit: { select: { name: true, allowsDecimals: true } },
        },
      },
    },
  });
  const productIds = supplied.map((item) => item.productId);

  const [stocks, reserved, onOrder, current] = await Promise.all([
    db.productStock.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds } },
      _sum: { quantity: true },
    }),
    db.saleItem.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        sale: { state: { in: RESERVED_SALE_STATES } },
      },
      _sum: { quantity: true },
    }),
    db.purchaseOrderItem.findMany({
      where: {
        productId: { in: productIds },
        purchaseOrder: {
          state: { in: OPEN_PO_STATES },
          ...(orderId ? { id: { not: orderId } } : {}),
        },
      },
      select: { productId: true, quantity: true, receivedQuantity: true },
    }),
    orderId
      ? db.purchaseOrderItem.findMany({
          where: { purchaseOrderId: orderId },
          select: { productId: true, quantity: true, unitCost: true },
        })
      : Promise.resolve([]),
  ]);

  const sum = (
    rows: { productId: string; _sum: { quantity: unknown } }[],
    id: string,
  ) =>
    String(
      (rows.find((row) => row.productId === id)?._sum.quantity as
        { toString(): string } | undefined) ?? "0",
    );
  // What was ordered and still to arrive (what was received in excess does not subtract).
  const pendingOnOrder = (id: string) =>
    fromMilli(
      onOrder
        .filter((row) => row.productId === id)
        .reduce((total, row) => {
          const missing = toMilli(row.quantity) - toMilli(row.receivedQuantity);
          return total + (missing > BigInt(0) ? missing : BigInt(0));
        }, BigInt(0)),
    );

  return supplied.map((item) => {
    const stock = sum(stocks, item.productId);
    const reservedQty = sum(reserved, item.productId);
    const ordered = pendingOnOrder(item.productId);
    const line = current.find((row) => row.productId === item.productId);
    return {
      productId: item.productId,
      name: item.product.name,
      sku: item.product.sku,
      isActive: item.product.isActive,
      supplierCode: item.supplierCode,
      unit: item.product.measurementUnit.name,
      allowsDecimals: item.product.measurementUnit.allowsDecimals,
      taxRate: item.product.taxRate.rate,
      lastCost: item.lastCost,
      minStock: item.product.minStock,
      stock,
      reserved: reservedQty,
      onOrder: ordered,
      suggested: suggestQuantity({
        minStock: item.product.minStock,
        stock,
        reserved: reservedQty,
        onOrder: ordered,
        allowsDecimals: item.product.measurementUnit.allowsDecimals,
      }),
      quantity: line?.quantity ?? null,
      unitCost: line?.unitCost ?? null,
    };
  });
}

/** A PO with what is needed for the detail and the printout. */
export async function getPurchaseOrder(number: number) {
  return db.purchaseOrder.findUnique({
    where: { number },
    include: {
      supplier: {
        select: {
          id: true,
          legalName: true,
          tradeName: true,
          cuit: true,
          contactName: true,
          contactPhone: true,
          contactMail: true,
          isActive: true,
        },
      },
      createdBy: {
        select: { person: { select: { name: true, surname: true } } },
      },
      items: {
        orderBy: { product: { name: "asc" } },
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              tracksExpiry: true,
              measurementUnit: { select: { name: true, allowsDecimals: true } },
              suppliers: { select: { supplierId: true, supplierCode: true } },
            },
          },
        },
      },
      receipts: {
        orderBy: { number: "asc" },
        select: {
          number: true,
          state: true,
          createdAt: true,
          deliveryNote: true,
          warehouse: { select: { name: true } },
        },
      },
      invoices: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          pointOfSale: true,
          number: true,
          issueDate: true,
          total: true,
          state: true,
          items: { select: { productId: true, quantity: true } },
        },
      },
    },
  });
}

/** A supplier invoice with its PO, lines and who entered, approved or voided it. */
export async function getSupplierInvoice(id: string) {
  return db.supplierInvoice.findUnique({
    where: { id },
    include: {
      purchaseOrder: {
        select: {
          number: true,
          items: {
            select: {
              productId: true,
              unitCost: true,
              quantity: true,
              receivedQuantity: true,
            },
          },
        },
      },
      supplier: { select: { legalName: true, tradeName: true, cuit: true } },
      createdBy: {
        select: { person: { select: { name: true, surname: true } } },
      },
      approvedBy: {
        select: { person: { select: { name: true, surname: true } } },
      },
      annulledBy: {
        select: { person: { select: { name: true, surname: true } } },
      },
      items: {
        orderBy: { product: { name: "asc" } },
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              measurementUnit: { select: { name: true } },
            },
          },
        },
      },
    },
  });
}

/** A receiving report with its PO, warehouse and products. */
export async function getGoodsReceipt(number: number) {
  return db.goodsReceipt.findUnique({
    where: { number },
    include: {
      purchaseOrder: {
        select: {
          id: true,
          number: true,
          supplier: { select: { legalName: true, tradeName: true } },
        },
      },
      warehouse: { select: { name: true } },
      createdBy: {
        select: { person: { select: { name: true, surname: true } } },
      },
      annulledBy: {
        select: { person: { select: { name: true, surname: true } } },
      },
      items: {
        orderBy: { product: { name: "asc" } },
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              measurementUnit: { select: { name: true } },
            },
          },
        },
      },
      lots: { orderBy: [{ expiresOn: "asc" }, { lotCode: "asc" }] },
    },
  });
}

const personName = {
  select: { person: { select: { name: true, surname: true } } },
} as const;

/** A payment order with its supplier, methods and allocations. */
export async function getSupplierPayment(number: number) {
  return db.supplierPayment.findUnique({
    where: { number },
    include: {
      supplier: {
        select: {
          id: true,
          legalName: true,
          tradeName: true,
          cuit: true,
          contactName: true,
          contactPhone: true,
        },
      },
      lines: { orderBy: { id: "asc" } },
      allocations: {
        orderBy: { createdAt: "asc" },
        include: {
          invoice: {
            select: { id: true, type: true, pointOfSale: true, number: true },
          },
        },
      },
      createdBy: personName,
      annulledBy: personName,
    },
  });
}

/** A supplier credit note with its associated invoice and allocations. */
export async function getCreditNote(id: string) {
  return db.supplierCreditNote.findUnique({
    where: { id },
    include: {
      supplier: {
        select: { id: true, legalName: true, tradeName: true, cuit: true },
      },
      invoice: {
        select: { id: true, type: true, pointOfSale: true, number: true },
      },
      allocations: {
        orderBy: { createdAt: "asc" },
        include: {
          invoice: {
            select: { id: true, type: true, pointOfSale: true, number: true },
          },
        },
      },
      createdBy: personName,
      annulledBy: personName,
    },
  });
}
