"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActionDictionary } from "@/i18n/dictionary";
import { lockAccount, recomputeAccount } from "@/lib/account-ledger";
import { parseAdminOrder, saleItemSnapshot } from "@/lib/admin-order";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { cartTotals } from "@/lib/cart";
import { VISIBLE_PRODUCT } from "@/lib/catalog";
import { customerPrice, saleDiscount } from "@/lib/customer-price";
import { latestCosts } from "@/lib/cost-queries";
import { applyCreditCheck } from "@/lib/credit-ledger";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { getPricing } from "@/lib/pricing-queries";

// Pedido cargado por el admin en nombre de un cliente: queda Pendiente, con
// el admin como quien lo hizo, los precios del cliente (su lista y su
// descuento) del momento y efectivo. Mismo
// orden de bloqueo que el checkout: la cuenta del cliente primero.

export type NewOrderState = { error?: string };

/** Corta la transacción con un mensaje para el admin. */
class NewOrderError extends Error {}

export async function createOrderForCustomer(
  _prev: NewOrderState,
  formData: FormData,
): Promise<NewOrderState> {
  const user = await requirePermission("sales:manage");
  const t = getActionDictionary().adminOrderNew.errors;

  // Solo productos que se pueden vender ahora (activos y vigentes).
  const productIds = [...formData.keys()]
    .filter((key) => key.startsWith("qty_"))
    .map((key) => key.slice(4))
    .filter((id) => isCuid(id));
  const products = await db.product.findMany({
    where: { id: { in: productIds }, ...VISIBLE_PRODUCT },
    select: {
      id: true,
      price: true,
      weight: true,
      volume: true,
      taxRate: { select: { rate: true } },
      measurementUnit: { select: { allowsDecimals: true } },
    },
  });
  const parsed = parseAdminOrder(
    formData,
    products.map((product) => ({
      id: product.id,
      allowsDecimals: product.measurementUnit.allowsDecimals,
    })),
    t,
  );
  if (!parsed.ok) return { error: parsed.error };
  const { customerId, addressId, notes, lines } = parsed.data;

  let number = 0;
  try {
    number = await db.$transaction(async (tx) => {
      const address = await tx.customerAddress.findFirst({
        where: {
          id: addressId,
          customerId,
          deletedAt: null,
          customer: { deletedAt: null },
        },
        select: { id: true },
      });
      if (!address) throw new NewOrderError(t.address);
      await lockAccount(tx, customerId);

      const pricing = await getPricing(
        customerId,
        lines.map((line) => line.productId),
        tx,
      );
      const items = lines.map((line) => {
        const product = products.find((row) => row.id === line.productId)!;
        const price = customerPrice(product.id, product.price, pricing);
        return { line, product, price };
      });
      const costs = await latestCosts(
        lines.map((line) => line.productId),
        tx,
      );
      const totals = cartTotals(
        items.map(({ line, product, price }) => ({
          price,
          rate: product.taxRate.rate,
          quantity: line.quantity,
          weight: product.weight,
        })),
      );
      const sale = await tx.sale.create({
        data: {
          addressId,
          userId: user.id,
          subTotal: totals.net,
          tax: totals.tax,
          discount: saleDiscount(
            items.map(({ line, product, price }) => ({
              listPrice: product.price,
              price,
              quantity: line.quantity,
            })),
          ),
          total: totals.total,
          paymentMethod: "CASH",
          notes,
          items: {
            create: items.map(({ line, product, price }) =>
              saleItemSnapshot(
                product,
                line.quantity,
                price,
                costs[product.id],
              ),
            ),
          },
        },
        include: { items: true },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: "SALE",
        entityId: sale.id,
        after: sale,
        metadata: { placedForCustomer: customerId },
      });
      // Un saldo a favor puede dejarlo ya pagado.
      const account = await recomputeAccount(tx, customerId);
      // Igual que en la tienda: si no le da el crédito, queda para aprobar.
      await applyCreditCheck(tx, {
        saleId: sale.id,
        customerId,
        account,
        userId: user.id,
      });
      return sale.number;
    });
  } catch (error) {
    if (error instanceof NewOrderError) return { error: error.message };
    throw error;
  }

  revalidatePath("/[lang]", "layout");
  redirect(`/admin/orders/${number}`);
}
