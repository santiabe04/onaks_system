import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { cartTotals, lineTotals } from "@/lib/cart";
import { db } from "@/lib/db";
import { getCart, toCartLine } from "@/lib/cart-queries";
import { finalPrice } from "@/lib/price";
import { CartLineControls, RemoveCartLine } from "./cart-line";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.cart.title };
}

export default async function CartPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.cart.title}</h1>
      {/* El carrito sale de la DB en cada request: va en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Cart />
      </Suspense>
    </main>
  );
}

async function Cart() {
  const user = await getUserWithPermission("sales:create");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const [{ items, available, unavailable }, editing] = await Promise.all([
    getCart(user.personId),
    // Si está modificando un pedido, el carrito lo va a reemplazar.
    db.sale.findFirst({
      where: { editingPersonId: user.personId },
      select: { number: true },
    }),
  ]);

  if (items.length === 0) {
    return (
      <div className="mt-6 flex flex-col items-start gap-4">
        {editing && (
          <p
            role="status"
            className="rounded border border-current/20 bg-current/5 p-3 text-sm"
          >
            {interpolate(t.checkout.editingOrder, { number: editing.number })}
          </p>
        )}
        <p className="text-sm opacity-70">{t.cart.empty}</p>
        <Link href="/" className={buttonClass()}>
          {t.cart.goToCatalog}
        </Link>
      </div>
    );
  }

  const totals = cartTotals(available.map(toCartLine));

  return (
    <>
      {editing && (
        <p
          role="status"
          className="mt-4 rounded border border-current/20 bg-current/5 p-3 text-sm"
        >
          {interpolate(t.checkout.editingOrder, { number: editing.number })}
        </p>
      )}
      {available.length > 0 && (
        <ul className="mt-6 divide-y divide-current/10">
          {available.map((item) => (
            <li
              key={item.productId}
              className="flex flex-wrap items-start justify-between gap-4 py-4"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/products/${item.productId}`}
                  className="font-medium hover:underline"
                >
                  {item.product.name}
                </Link>
                <p className="text-xs opacity-70">
                  {item.product.sku} ·{" "}
                  {format.money(
                    finalPrice(item.product.price, item.product.taxRate.rate),
                  )}{" "}
                  / {item.product.measurementUnit.name}
                </p>
                <div className="mt-2">
                  <CartLineControls
                    productId={item.productId}
                    quantity={format.input(item.quantity)}
                    allowsDecimals={item.product.measurementUnit.allowsDecimals}
                    unitName={item.product.measurementUnit.name}
                    t={t.cart}
                  />
                </div>
              </div>
              <p className="font-semibold whitespace-nowrap">
                {format.money(lineTotals(toCartLine(item)).total)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {unavailable.length > 0 && (
        <section className="mt-6 rounded border border-current/20 p-4">
          <p className="text-sm font-medium">{t.cart.unavailable}</p>
          <p className="text-xs opacity-70">{t.cart.unavailableHint}</p>
          <ul className="mt-2 divide-y divide-current/10 text-sm">
            {unavailable.map((item) => (
              <li
                key={item.productId}
                className="flex items-center justify-between gap-4 py-2 opacity-70"
              >
                <span>{item.product.name}</span>
                <RemoveCartLine productId={item.productId} t={t.cart} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {available.length > 0 && (
        <dl className="mt-6 ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="opacity-70">{t.cart.net}</dt>
            <dd>{format.money(totals.net)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="opacity-70">{t.cart.tax}</dt>
            <dd>{format.money(totals.tax)}</dd>
          </div>
          <div className="flex justify-between border-t border-current/20 pt-1 text-lg font-semibold">
            <dt>{t.cart.total}</dt>
            <dd>{format.money(totals.total)}</dd>
          </div>
          <p className="mt-1 text-xs opacity-70">
            {interpolate(t.cart.weight, {
              weight: format.number(totals.weight),
            })}
          </p>
          <p className="text-xs opacity-70">{t.cart.pricesHint}</p>
          <Link
            href="/checkout"
            className={`${buttonClass()} mt-3 text-center`}
          >
            {t.cart.checkout}
          </Link>
        </dl>
      )}
    </>
  );
}
