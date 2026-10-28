import "server-only";
import type { PurchaseOrderState } from "@/generated/prisma/enums";
import { RESERVED_SALE_STATES } from "./checkout";
import { db } from "./db";
import { suggestQuantity } from "./purchase-order";
import { fromMilli, toMilli } from "./quantity";

/** OC que todavía esperan mercadería (cuenta como "ya pedido"). */
const OPEN_PO_STATES: PurchaseOrderState[] = ["SENT", "PARTIALLY_RECEIVED"];

/**
 * Los productos del proveedor para armar una OC: stock, reservado, mínimo,
 * lo ya pedido en otras OC sin recibir, la sugerencia y, si la OC ya tiene
 * líneas, lo cargado. Los productos borrados no se ofrecen.
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
  // Lo pedido que falta llegar (lo recibido de más no resta).
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

/** Una OC con lo necesario para el detalle y la impresión. */
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
              measurementUnit: { select: { name: true } },
              suppliers: { select: { supplierId: true, supplierCode: true } },
            },
          },
        },
      },
    },
  });
}
