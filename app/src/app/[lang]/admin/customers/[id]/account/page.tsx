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
import {
  AdjustmentForm,
  VoidCreditNoteForm,
} from "@/components/account/credit-note-forms";
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
      {/* params and the account are request-bound: they go in Suspense. */}
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
  /** Cents: positive adds debt, negative lowers it. 0 if voided. */
  amount: bigint;
  detail?: string;
  voided?: string;
  paymentId?: string;
  creditNoteId?: string;
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

  // Today's date for the form is the one from the request.
  await connection();
  const today = isoDay(new Date());
  const { sales, payments, creditNotes, summary } = await loadAccount(
    db,
    customer.id,
  );
  const balance = toCents(summary.balance);
  const canManage = can(user.role, "sales:manage");
  const day = (value: string) =>
    format.date(new Date(`${value}T12:00:00-03:00`));

  // Delivered orders are debt; payments and refunds move it.
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
    ...creditNotes.map((note) => {
      const cents = toCents(note.amount);
      const voidedBy = note.voidedBy?.person;
      return {
        key: `credit-note-${note.id}`,
        day: isoDay(note.createdAt),
        concept: interpolate(t.account.creditNoteConcept, {
          number: note.number,
          kind: t.customerCreditNotes.kinds[note.kind],
        }),
        href: note.sale ? `/admin/orders/${note.sale.number}` : undefined,
        amount: note.voidedAt ? BigInt(0) : -cents,
        detail: [
          note.reason,
          note.sale && `#${note.sale.number}`,
          `${note.createdBy.person.name} ${note.createdBy.person.surname}`,
        ]
          .filter(Boolean)
          .join(" · "),
        voided: note.voidedAt
          ? `${interpolate(t.customerCreditNotes.voided, { reason: note.voidReason ?? "" })}${
              voidedBy ? ` (${voidedBy.name} ${voidedBy.surname})` : ""
            } · ${format.money(fromCents(cents))}`
          : undefined,
        creditNoteId: note.voidedAt ? undefined : note.id,
      };
    }),
  ].sort((a, b) => a.day.localeCompare(b.day));

  // Running balance row by row.
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
          {Number(summary.credited) > 0 && (
            <span>
              {interpolate(t.account.credited, {
                amount: format.money(summary.credited),
              })}
            </span>
          )}
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

      {canManage && (
        <section className="mt-6 print:hidden">
          <h2 className="mb-3 text-lg font-medium">
            {t.customerCreditNotes.adjustmentTitle}
          </h2>
          <AdjustmentForm customerId={customer.id} t={t.customerCreditNotes} />
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
                      {canManage && row.creditNoteId && (
                        <VoidCreditNoteForm
                          noteId={row.creditNoteId}
                          t={t.customerCreditNotes}
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
