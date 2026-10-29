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
import {
  parseAllocations,
  parsePaymentHeader,
  parsePaymentLines,
  unallocatedOf,
} from "@/lib/supplier-account";
import {
  loadSupplierAccount,
  lockSupplier,
  openInvoices,
  writeAllocations,
} from "@/lib/supplier-account-ledger";

// Órdenes de pago a proveedores: uno o varios medios, imputadas a facturas
// aprobadas (lo que sobra queda a cuenta y se imputa después). Se anulan con
// motivo y dejan de contar. Todo con el proveedor bloqueado.
const PERMISSION = "purchases:manage";
const ENTITY = "SUPPLIER_PAYMENT";

export type SupplierPaymentActionState = { error?: string };

/** Corta la transacción con un mensaje para el admin. */
class PaymentError extends Error {}

function messages() {
  return getActionDictionary().supplierPayments.errors;
}

async function run(
  work: () => Promise<void>,
): Promise<SupplierPaymentActionState | null> {
  try {
    await work();
    return null;
  } catch (error) {
    if (error instanceof PaymentError) return { error: error.message };
    throw error;
  }
}

function revalidateAccounts() {
  revalidatePath("/[lang]/admin", "layout");
}

/** Bloquea al proveedor de la OP y después la OP; la devuelve. */
async function lockPayment(tx: Prisma.TransactionClient, paymentId: string) {
  const t = messages();
  if (!isCuid(paymentId)) throw new PaymentError(t.notFound);
  const found = await tx.supplierPayment.findUnique({
    where: { id: paymentId },
    select: { supplierId: true },
  });
  if (!found) throw new PaymentError(t.notFound);
  await lockSupplier(tx, found.supplierId);
  await tx.$queryRaw`
    SELECT "id" FROM "supplier_payments" WHERE "id" = ${paymentId} FOR UPDATE`;
  const payment = await tx.supplierPayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { allocations: true },
  });
  if (payment.annulledAt) throw new PaymentError(t.alreadyAnnulled);
  return payment;
}

/** Nueva OP: medios, total e imputación a facturas del proveedor. */
export async function createSupplierPayment(
  supplierId: string,
  _prev: SupplierPaymentActionState,
  formData: FormData,
): Promise<SupplierPaymentActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  const header = parsePaymentHeader(formData, t);
  if (!header.ok) return { error: header.error };
  const lines = parsePaymentLines(formData, t);
  if (!lines.ok) return { error: lines.error };

  let number = 0;
  const failed = await run(() =>
    db.$transaction(async (tx) => {
      if (!isCuid(supplierId) || !(await lockSupplier(tx, supplierId))) {
        throw new PaymentError(t.supplier);
      }
      const account = await loadSupplierAccount(tx, supplierId);
      const allocations = parseAllocations(
        formData,
        openInvoices(account),
        lines.total,
        t,
      );
      if (!allocations.ok) throw new PaymentError(allocations.error);

      const payment = await tx.supplierPayment.create({
        data: {
          supplierId,
          paidOn: new Date(`${header.data.paidOn}T00:00:00Z`),
          total: lines.total,
          notes: header.data.notes,
          createdById: user.id,
          lines: {
            create: lines.lines.map((line) => ({
              ...line,
              dueDate: line.dueDate
                ? new Date(`${line.dueDate}T00:00:00Z`)
                : null,
            })),
          },
        },
        include: { lines: true },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: payment.id,
        after: payment,
      });
      await writeAllocations(
        tx,
        { kind: ENTITY, id: payment.id },
        allocations.allocations,
        user.id,
      );
      number = payment.number;
    }),
  );
  if (failed) return failed;
  revalidateAccounts();
  redirect(`/admin/supplier-payments/${number}`);
}

/** Imputa lo que quedó a cuenta de una OP a facturas con saldo. */
export async function allocateSupplierPayment(
  paymentId: string,
  _prev: SupplierPaymentActionState,
  formData: FormData,
): Promise<SupplierPaymentActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const payment = await lockPayment(tx, paymentId);
      const available = unallocatedOf({
        total: payment.total,
        annulled: false,
        allocations: payment.allocations,
      });
      if (available === "0.00") throw new PaymentError(t.nothingToAllocate);
      const account = await loadSupplierAccount(tx, payment.supplierId);
      const allocations = parseAllocations(
        formData,
        openInvoices(account),
        available,
        t,
      );
      if (!allocations.ok) throw new PaymentError(allocations.error);
      await writeAllocations(
        tx,
        { kind: ENTITY, id: payment.id },
        allocations.allocations,
        user.id,
      );
    }),
  );
  if (failed) return failed;
  revalidateAccounts();
  return {};
}

/** Anula una OP: el pago y sus imputaciones dejan de contar. */
export async function annulSupplierPayment(
  paymentId: string,
  _prev: SupplierPaymentActionState,
  formData: FormData,
): Promise<SupplierPaymentActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  const reason = parseReason(formData, t);
  if (!reason.ok) return { error: reason.error };

  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const payment = await lockPayment(tx, paymentId);
      const after = await tx.supplierPayment.update({
        where: { id: payment.id },
        data: {
          annulledAt: new Date(),
          annulReason: reason.reason,
          annulledById: user.id,
        },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: payment.id,
        before: { annulledAt: null },
        after: { annulledAt: after.annulledAt, annulReason: after.annulReason },
      });
    }),
  );
  if (failed) return failed;
  revalidateAccounts();
  return {};
}
