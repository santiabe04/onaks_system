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
import { enqueueOrderNotice } from "@/lib/order-notice-ledger";
import { isCuid } from "@/lib/ids";
import { getPricing } from "@/lib/pricing-queries";

// Order entered by the admin on behalf of a customer: it is Pending, with
// the admin as the one who did it, the customer's prices (their list and their
// discount) at that time, and cash. Same
// lock order as checkout: the customer's account first.

export type NewOrderState = { error?: string };

/** Aborts the transaction with a message for the admin. */
class NewOrderError extends Error {}

export async function createOrderForCustomer(
  _prev: NewOrderState,
  formData: FormData,
): Promise<NewOrderState> {
  const user = await requirePermission("sales:manage");
  const t = getActionDictionary().adminOrderNew.errors;

  // Only products that can be sold now (active and current).
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
      // A credit balance can leave it already paid.
      const account = await recomputeAccount(tx, customerId);
      // Same as in the shop: if it does not get the credit, it is held for approval.
      await applyCreditCheck(tx, {
        saleId: sale.id,
        customerId,
        account,
        userId: user.id,
      });
      // Confirmed: email notice to the appropriate person of the company.
      await enqueueOrderNotice(tx, sale, "PENDING");
      return sale.number;
    });
  } catch (error) {
    if (error instanceof NewOrderError) return { error: error.message };
    throw error;
  }

  revalidatePath("/[lang]", "layout");
  redirect(`/admin/orders/${number}`);
}
