import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  PaymentForm,
  VoidPaymentForm,
} from "@/components/account/payment-forms";
import { BalanceLine } from "@/components/account/balance-line";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { fromCents, isCharged, maxRefund, toCents } from "@/lib/account";
import { loadAccount } from "@/lib/account-ledger";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { isoDay } from "@/lib/order-period";
import { can } from "@/lib/permissions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.account.title };
}

export default async function CustomerAccountPage({
  params,
}: PageProps<"/[lang]/admin/customers/[id]/account">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      {/* params y la cuenta son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <Account params={params} />
      </Suspense>
    </main>
  );
}

type Movement = {
  key: string;
  day: string;
  concept: string;
  href?: string;
  /** Centavos: positivo suma deuda, negativo la baja. 0 si está anulado. */
  amount: bigint;
  detail?: string;
  voided?: string;
  paymentId?: string;
};

async function Account({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUserWithPermission("sales:read-all");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const { id } = await params;
  if (!isCuid(id)) notFound();
  const customer = await db.customer.findUnique({
    where: { id },
    select: { id: true, tradeName: true },
  });
  if (!customer) notFound();

  // La fecha de hoy para el form es la del request.
  await connection();
  const today = isoDay(new Date());
  const { sales, payments, summary } = await loadAccount(db, customer.id);
  const balance = toCents(summary.balance);
  const canManage = can(user.role, "sales:manage");
  const day = (value: string) =>
    format.date(new Date(`${value}T12:00:00-03:00`));

  // Los pedidos entregados son deuda; cobros y reintegros la mueven.
  const movements: Movement[] = [
    ...sales
      .filter((sale) => isCharged(sale.state))
      .map((sale) => ({
        key: `sale-${sale.id}`,
        day: isoDay(sale.createdAt),
        concept: interpolate(t.account.orderCharge, { number: sale.number }),
        href: `/admin/orders/${sale.number}`,
        amount: toCents(sale.total),
      })),
    ...payments.map((payment) => {
      const cents = toCents(payment.amount);
      const voidedBy = payment.voidedBy?.person;
      return {
        key: `payment-${payment.id}`,
        day: payment.paidOn.toISOString().slice(0, 10),
        concept: `${t.account.kinds[payment.kind]} · ${t.orders.paymentMethods[payment.method]}`,
        href: payment.sale ? `/admin/orders/${payment.sale.number}` : undefined,
        amount: payment.voidedAt
          ? BigInt(0)
          : payment.kind === "PAYMENT"
            ? -cents
            : cents,
        detail: [
          payment.notes,
          payment.sale && `#${payment.sale.number}`,
          `${payment.createdBy.person.name} ${payment.createdBy.person.surname}`,
        ]
          .filter(Boolean)
          .join(" · "),
        voided: payment.voidedAt
          ? `${interpolate(t.account.voided, { reason: payment.voidReason ?? "" })}${
              voidedBy ? ` (${voidedBy.name} ${voidedBy.surname})` : ""
            } · ${format.money(fromCents(cents))}`
          : undefined,
        paymentId: payment.voidedAt ? undefined : payment.id,
      };
    }),
  ].sort((a, b) => a.day.localeCompare(b.day));

  // Saldo acumulado fila por fila.
  const rows = movements.reduce<(Movement & { balance: bigint })[]>(
    (acc, movement) => [
      ...acc,
      {
        ...movement,
        balance: (acc.at(-1)?.balance ?? BigInt(0)) + movement.amount,
      },
    ],
    [],
  );

  return (
    <>
      <Link
        href={`/admin/customers/${customer.id}`}
        className="text-sm hover:underline"
      >
        ← {customer.tradeName}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">
        {interpolate(t.account.of, { customer: customer.tradeName })}
      </h1>

      <section className="mt-6 rounded border border-current/20 p-4">
        <BalanceLine
          balance={summary.balance}
          t={t.account}
          format={format}
          large
        />
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm opacity-70">
          <span>
            {interpolate(t.account.charged, {
              amount: format.money(summary.charged),
            })}
          </span>
          <span>
            {interpolate(t.account.paid, {
              amount: format.money(summary.paid),
            })}
          </span>
        </p>
        <p className="mt-1 text-xs opacity-70">{t.account.howItWorks}</p>
      </section>

      {canManage && (
        <section className="mt-6 print:hidden">
          <h2 className="mb-3 text-lg font-medium">{t.account.register}</h2>
          <PaymentForm
            customerId={customer.id}
            suggestedAmount={
              balance > BigInt(0) ? format.input(fromCents(balance)) : undefined
            }
            maxRefund={
              balance < BigInt(0)
                ? format.money(maxRefund(summary.balance))
                : undefined
            }
            today={today}
            t={t.account}
            methods={t.orders.paymentMethods}
          />
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-medium">{t.account.movements}</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm opacity-70">{t.account.empty}</p>
        ) : (
          <div className="mt-3 overflow-x-auto print:overflow-visible">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-current/20">
                <tr>
                  <th className="py-2 pr-3 font-medium">
                    {t.account.columns.date}
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    {t.account.columns.concept}
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    {t.account.columns.debit}
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    {t.account.columns.credit}
                  </th>
                  <th className="py-2 text-right font-medium">
                    {t.account.columns.balance}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    className={`border-b border-current/10 align-top ${
                      row.voided ? "opacity-50" : ""
                    }`}
                  >
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {day(row.day)}
                    </td>
                    <td className="py-2 pr-3">
                      {row.href ? (
                        <Link href={row.href} className="hover:underline">
                          {row.concept}
                        </Link>
                      ) : (
                        row.concept
                      )}
                      {row.detail && (
                        <span className="block text-xs opacity-70">
                          {row.detail}
                        </span>
                      )}
                      {row.voided && (
                        <span className="block text-xs line-through">
                          {row.voided}
                        </span>
                      )}
                      {canManage && row.paymentId && (
                        <VoidPaymentForm
                          paymentId={row.paymentId}
                          t={t.account}
                        />
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {row.amount > BigInt(0) &&
                        format.money(fromCents(row.amount))}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {row.amount < BigInt(0) &&
                        format.money(fromCents(-row.amount))}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {format.money(fromCents(row.balance))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
