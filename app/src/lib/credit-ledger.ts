import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { loadAccount } from "./account-ledger";
import { audit } from "./audit";
import { checkCredit, type CreditHoldReasons } from "./credit";

/**
 * Control de crédito de un pedido recién confirmado (o modificado), con la
 * cuenta ya recalculada y bloqueada: si el cliente supera su límite o tiene
 * deuda vencida, el pedido queda retenido; si no, se le saca la retención que
 * pudiera tener sin aprobar. Devuelve los motivos (null si pasa).
 */
export async function applyCreditCheck(
  tx: Prisma.TransactionClient,
  input: {
    saleId: string;
    customerId: string;
    account: Awaited<ReturnType<typeof loadAccount>>;
    userId: string;
  },
): Promise<CreditHoldReasons | null> {
  const [customer, sale] = await Promise.all([
    tx.customer.findUniqueOrThrow({
      where: { id: input.customerId },
      select: { creditLimit: true, paymentTermDays: true },
    }),
    tx.sale.findUniqueOrThrow({
      where: { id: input.saleId },
      select: { creditHoldAt: true, creditReleasedAt: true },
    }),
  ]);
  const reasons = checkCredit({
    creditLimit: customer.creditLimit,
    paymentTermDays: customer.paymentTermDays,
    summary: input.account.summary,
    sales: input.account.sales,
    now: new Date(),
  });

  if (reasons) {
    await tx.sale.update({
      where: { id: input.saleId },
      data: {
        creditHoldAt: new Date(),
        creditHoldReasons: reasons,
        creditReleasedAt: null,
        creditReleasedById: null,
        creditReleaseNote: null,
      },
    });
  } else if (sale.creditHoldAt && !sale.creditReleasedAt) {
    // Se modificó y ahora entra: ya no hace falta aprobarlo.
    await tx.sale.update({
      where: { id: input.saleId },
      data: { creditHoldAt: null, creditHoldReasons: Prisma.DbNull },
    });
  } else {
    return null;
  }
  await audit(tx, {
    action: "UPDATE",
    actorUserId: input.userId,
    entityType: "SALE",
    entityId: input.saleId,
    before: { creditHoldAt: sale.creditHoldAt },
    after: { creditHold: reasons },
    metadata: { creditCheck: true },
  });
  return reasons;
}
