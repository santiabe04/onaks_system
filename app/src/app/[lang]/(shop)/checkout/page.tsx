import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { cartTotals, lineTotals } from "@/lib/cart";
import { getCart, toCartLine, toFingerprintLine } from "@/lib/cart-queries";
import { cartFingerprint } from "@/lib/cart-fingerprint";
import { db } from "@/lib/db";
import { CheckoutForm } from "./checkout-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.checkout.title };
}

export default async function CheckoutPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.checkout.title}</h1>
      {/* El carrito y las direcciones salen de la DB en cada request. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Checkout />
      </Suspense>
    </main>
  );
}

async function Checkout() {
  const user = await getUserWithPermission("sales:create");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const [{ available, unavailable }, addresses] = await Promise.all([
    getCart(user.personId),
    db.customerAddress.findMany({
      // Las direcciones son de la empresa: cualquier persona usa cualquiera.
      where: { customerId: user.customerId ?? "", deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        address: true,
        zipCode: true,
        city: { select: { name: true } },
      },
    }),
  ]);
  // Sin nada para pedir no hay nada que confirmar.
  if (available.length === 0) redirect("/cart");

  const totals = cartTotals(available.map(toCartLine));

  return (
    <div className="mt-6 grid gap-8 md:grid-cols-[3fr_2fr]">
      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-semibold">{t.checkout.summary}</h2>
          <Link href="/cart" className="text-sm hover:underline">
            {t.checkout.editCart}
          </Link>
        </div>
        <ul className="mt-2 divide-y divide-current/10 text-sm">
          {available.map((item) => (
            <li
              key={item.productId}
              className="flex justify-between gap-4 py-2"
            >
              <span>
                {item.product.name}
                <span className="block text-xs opacity-70">
                  {format.number(item.quantity)}{" "}
                  {item.product.measurementUnit.name}
                </span>
              </span>
              <span className="whitespace-nowrap">
                {format.money(lineTotals(toCartLine(item)).total)}
              </span>
            </li>
          ))}
        </ul>
        {unavailable.length > 0 && (
          <p className="mt-2 text-xs opacity-70">
            {interpolate(t.checkout.excluded, {
              count: unavailable.length,
            })}
          </p>
        )}
        <dl className="mt-4 flex flex-col gap-1 border-t border-current/20 pt-2 text-sm">
          <div className="flex justify-between">
            <dt className="opacity-70">{t.cart.net}</dt>
            <dd>{format.money(totals.net)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="opacity-70">{t.cart.tax}</dt>
            <dd>{format.money(totals.tax)}</dd>
          </div>
          <div className="flex justify-between text-lg font-semibold">
            <dt>{t.cart.total}</dt>
            <dd>{format.money(totals.total)}</dd>
          </div>
          <p className="text-xs opacity-70">
            {interpolate(t.cart.weight, {
              weight: format.number(totals.weight),
            })}
          </p>
        </dl>
      </section>

      <section>
        {addresses.length === 0 ? (
          <p role="alert" className="text-sm">
            {t.checkout.noAddresses}
          </p>
        ) : (
          <CheckoutForm
            addresses={addresses.map((address) => ({
              id: address.id,
              name: address.name,
              detail: [
                address.address,
                address.city.name,
                address.zipCode && `CP ${address.zipCode}`,
              ]
                .filter(Boolean)
                .join(", "),
            }))}
            fingerprint={cartFingerprint(available.map(toFingerprintLine))}
            t={t.checkout}
          />
        )}
      </section>
    </div>
  );
}
