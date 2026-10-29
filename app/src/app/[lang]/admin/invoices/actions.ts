"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseReason } from "@/lib/goods-receipt";
import { isCuid } from "@/lib/ids";
import { lockPurchaseOrder } from "@/lib/purchase-lock";
import { toMilli } from "@/lib/quantity";
import { lockSupplier } from "@/lib/supplier-account-ledger";
import {
  invoiceTotals,
  matchInvoice,
  parseInvoiceHeader,
  parseInvoiceLines,
} from "@/lib/supplier-invoice";
import {
  invoicedByProduct,
  updateLastCosts,
} from "@/lib/supplier-invoice-ledger";

// Facturas de proveedores: se cargan por OC y pasan el control de 3 vías.
// Sin diferencias quedan aprobadas; con diferencias, observadas hasta que un
// admin las aprueba. Al aprobarse actualizan el último costo del proveedor.
// Orden de bloqueo: la OC, después la factura y el proveedor.
const PERMISSION = "purchases:manage";
const ENTITY = "SUPPLIER_INVOICE";

export type InvoiceActionState = { error?: string };

/** Corta la transacción con un mensaje para el admin. */
class InvoiceError extends Error {}

function messages() {
  return getActionDictionary().invoices.errors;
}

async function run(
  work: () => Promise<void>,
): Promise<InvoiceActionState | null> {
  try {
    await work();
    return null;
  } catch (error) {
    if (error instanceof InvoiceError) return { error: error.message };
    throw error;
  }
}

function revalidatePurchases() {
  revalidatePath("/[lang]/admin", "layout");
}

/** Bloquea la OC de la factura y después la factura; la devuelve. */
async function lockInvoice(tx: Prisma.TransactionClient, invoiceId: string) {
  const t = messages();
  if (!isCuid(invoiceId)) throw new InvoiceError(t.notFound);
  const found = await tx.supplierInvoice.findUnique({
    where: { id: invoiceId },
    select: { purchaseOrderId: true },
  });
  if (!found) throw new InvoiceError(t.notFound);
  await lockPurchaseOrder(tx, found.purchaseOrderId);
  await tx.$queryRaw`
    SELECT "id" FROM "supplier_invoices" WHERE "id" = ${invoiceId} FOR UPDATE`;
  return tx.supplierInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { items: true },
  });
}

/** Carga una factura de la OC con el control de 3 vías. */
export async function createSupplierInvoice(
  orderId: string,
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  const header = parseInvoiceHeader(formData, t);
  if (!header.ok) return { error: header.error };

  let invoiceId = "";
  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const order = await lockPurchaseOrder(tx, orderId);
      if (!order) throw new InvoiceError(t.orderNotFound);
      const items = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: order.id },
        select: {
          productId: true,
          unitCost: true,
          taxRate: true,
          receivedQuantity: true,
          product: {
            select: { measurementUnit: { select: { allowsDecimals: true } } },
          },
        },
      });
      if (!items.some((item) => toMilli(item.receivedQuantity) > BigInt(0))) {
        throw new InvoiceError(t.notInvoiceable);
      }

      // El proveedor bloqueado: dos cargas del mismo comprobante no pasan las dos.
      await tx.$queryRaw`
        SELECT "id" FROM "suppliers" WHERE "id" = ${order.supplierId} FOR UPDATE`;
      const duplicate = await tx.supplierInvoice.findFirst({
        where: {
          supplierId: order.supplierId,
          type: header.data.type,
          pointOfSale: header.data.pointOfSale,
          number: header.data.number,
          state: { not: "ANNULLED" },
        },
        select: { id: true },
      });
      if (duplicate) throw new InvoiceError(t.duplicate);

      const parsed = parseInvoiceLines(
        formData,
        items.map((item) => ({
          productId: item.productId,
          allowsDecimals: item.product.measurementUnit.allowsDecimals,
        })),
        t,
      );
      if (!parsed.ok) throw new InvoiceError(parsed.error);

      const item = (productId: string) =>
        items.find((row) => row.productId === productId)!;
      const invoiced = await invoicedByProduct(tx, order.id);
      const totals = invoiceTotals(
        parsed.lines.map((line) => ({
          ...line,
          taxRate: item(line.productId).taxRate,
        })),
        header.data,
      );
      const differences = matchInvoice({
        lines: parsed.lines,
        order: items.map((row) => ({
          productId: row.productId,
          unitCost: row.unitCost,
          received: row.receivedQuantity,
          invoiced: invoiced.get(row.productId) ?? "0",
        })),
        computedTotal: totals.total,
        printedTotal: header.data.printedTotal,
      });
      const approved = differences.length === 0;
      const day = (value: string) => new Date(`${value}T00:00:00Z`);

      const invoice = await tx.supplierInvoice.create({
        data: {
          purchaseOrderId: order.id,
          supplierId: order.supplierId,
          type: header.data.type,
          pointOfSale: header.data.pointOfSale,
          number: header.data.number,
          issueDate: day(header.data.issueDate),
          dueDate: header.data.dueDate ? day(header.data.dueDate) : null,
          subTotal: totals.net,
          tax: totals.tax,
          vatPerception: header.data.vatPerception,
          iibbPerception: header.data.iibbPerception,
          otherTaxes: header.data.otherTaxes,
          total: totals.total,
          printedTotal: header.data.printedTotal,
          differences,
          notes: header.data.notes,
          state: approved ? "APPROVED" : "FLAGGED",
          approvedAt: approved ? new Date() : null,
          approvedById: approved ? user.id : null,
          createdById: user.id,
          items: {
            create: parsed.lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              unitCost: line.unitCost,
              taxRate: item(line.productId).taxRate,
            })),
          },
        },
        include: { items: true },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: invoice.id,
        after: invoice,
      });
      if (approved) {
        await updateLastCosts(
          tx,
          {
            supplierId: order.supplierId,
            issueDate: header.data.issueDate,
            items: invoice.items,
          },
          user.id,
        );
      }
      invoiceId = invoice.id;
    }),
  );
  if (failed) return failed;
  revalidatePurchases();
  redirect(`/admin/invoices/${invoiceId}`);
}

/** Acepta una factura observada tal como está, con un comentario. */
export async function approveSupplierInvoice(
  invoiceId: string,
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  const note = parseReason(formData, t);
  if (!note.ok) return { error: note.error };

  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const invoice = await lockInvoice(tx, invoiceId);
      if (invoice.state !== "FLAGGED") throw new InvoiceError(t.notFlagged);
      const after = await tx.supplierInvoice.update({
        where: { id: invoice.id },
        data: {
          state: "APPROVED",
          approvalNote: note.reason,
          approvedAt: new Date(),
          approvedById: user.id,
        },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: invoice.id,
        before: { state: invoice.state },
        after: { state: after.state, approvalNote: after.approvalNote },
      });
      await updateLastCosts(
        tx,
        {
          supplierId: invoice.supplierId,
          issueDate: invoice.issueDate.toISOString().slice(0, 10),
          items: invoice.items,
        },
        user.id,
      );
    }),
  );
  if (failed) return failed;
  revalidatePurchases();
  return {};
}

/**
 * Anula una factura cargada por error: deja de contar como facturado (el
 * último costo que haya actualizado queda como está).
 */
export async function annulSupplierInvoice(
  invoiceId: string,
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  const reason = parseReason(formData, t);
  if (!reason.ok) return { error: reason.error };

  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const invoice = await lockInvoice(tx, invoiceId);
      if (invoice.state === "ANNULLED") {
        throw new InvoiceError(t.alreadyAnnulled);
      }
      // Con el proveedor bloqueado nadie imputa a la factura mientras tanto.
      await lockSupplier(tx, invoice.supplierId);
      const allocated = await tx.supplierAllocation.count({
        where: {
          invoiceId: invoice.id,
          OR: [
            { payment: { annulledAt: null } },
            { creditNote: { annulledAt: null } },
          ],
        },
      });
      if (allocated > 0) throw new InvoiceError(t.allocated);
      const after = await tx.supplierInvoice.update({
        where: { id: invoice.id },
        data: {
          state: "ANNULLED",
          annulledAt: new Date(),
          annulReason: reason.reason,
          annulledById: user.id,
        },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: invoice.id,
        before: { state: invoice.state },
        after: { state: after.state, annulReason: after.annulReason },
      });
    }),
  );
  if (failed) return failed;
  revalidatePurchases();
  return {};
}
