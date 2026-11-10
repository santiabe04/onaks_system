import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BalanceLine } from "@/components/account/balance-line";
import { PaymentForm } from "@/components/account/payment-forms";
import type { SaleState } from "@/generated/prisma/enums";
import { Suspense } from "react";
import { OrderDetail, OrderItems } from "@/components/orders/order-items";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { formatCuit } from "@/lib/cuit";
import { fromCents, isCharged, maxRefund, toCents } from "@/lib/account";
import { loadAccount } from "@/lib/account-ledger";
import { db } from "@/lib/db";
import { isoDay } from "@/lib/order-period";
import { can } from "@/lib/permissions";
import { groupOrdersByZone } from "@/lib/orders-by-zone";
import { allowedTransitions, isStepBack, stockEffect } from "@/lib/sale-state";
import { isOnCreditHold, type CreditHoldReasons } from "@/lib/credit";
import { CreditNoteList } from "@/components/account/credit-note-list";
import { VoidCreditNoteForm } from "@/components/account/credit-note-forms";
import { buttonClass } from "@/components/ui/button";
import { isReturnable } from "@/lib/customer-credit";
import { OrderNotices } from "@/components/orders/order-notices";
import { TransferProofList } from "@/components/orders/transfer-proof-list";
import { CreditHoldControl } from "./credit-hold-control";
import { CustomerEditControl } from "./customer-edit-control";
import { ProofReviewForm } from "./proof-review-form";
import { StateChangeForm } from "./state-change-form";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/orders/[number]">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.orders.detailTitle, { number: (await params).number }),
  };
}

export default async function AdminOrderPage({
  params,
}: PageProps<"/[lang]/admin/orders/[number]">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <Link href="/admin/orders" className="text-sm hover:underline">
        {t.adminOrders.detail.back}
      </Link>
      {/* params and the DB query are request-bound: they go in Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Order params={params} />
      </Suspense>
    </main>
  );
}

// Detail + status change (with stock return/deduction) and history.
async function Order({ params }: { params: Promise<{ number: string }> }) {
  const user = await getUserWithPermission("sales:read-all");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();

  const sale = await db.sale.findUnique({
    where: { number },
    include: {
      address: {
        include: {
          customer: {
            select: { id: true, tradeName: true, legalName: true, cuit: true },
          },
          city: { select: { name: true, state: { select: { name: true } } } },
        },
      },
      user: {
        select: {
          person: {
            select: { name: true, surname: true, mail: true, phone: true },
          },
        },
      },
      editingPerson: { select: { name: true, surname: true } },
      creditReleasedBy: {
        select: { person: { select: { name: true, surname: true } } },
      },
      items: {
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              measurementUnit: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!sale) notFound();

  // To deduct stock: only active warehouses.
  const warehouses = await db.warehouse.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const { customer, city } = sale.address;
  // Customer account: what the customer owes and how much of this order is left.
  await connection();
  const today = isoDay(new Date());
  const account = await loadAccount(db, customer.id);
  const allocation = account.summary.sales[sale.id];
  const debt = toCents(account.summary.balance);
  // When collecting, the debt is suggested and, if the order is not yet a debt, what is left of it.
  const suggested =
    (debt > BigInt(0) ? debt : BigInt(0)) +
    (allocation && !isCharged(sale.state)
      ? toCents(allocation.pending)
      : BigInt(0));
  const canManage = can(user.role, "sales:manage");
  // Transfer receipts (with who uploaded them and who reviewed them).
  const proofRows = await db.transferProof.findMany({
    where: { saleId: sale.id },
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: {
        select: { person: { select: { name: true, surname: true } } },
      },
      reviewedBy: {
        select: { person: { select: { name: true, surname: true } } },
      },
    },
  });
  const proofs = proofRows.map((proof) => ({
    id: proof.id,
    file: proof.file,
    state: proof.state,
    createdAt: proof.createdAt,
    reviewedAt: proof.reviewedAt,
    rejectReason: proof.rejectReason,
    uploadedBy: `${proof.uploadedBy.person.name} ${proof.uploadedBy.person.surname}`,
    reviewedBy: proof.reviewedBy
      ? `${proof.reviewedBy.person.name} ${proof.reviewedBy.person.surname}`
      : null,
  }));
  // What is left to collect for this order is what is expected from the transfer.
  const proofAmount =
    allocation && toCents(allocation.pending) > BigInt(0)
      ? format.input(allocation.pending)
      : format.input(sale.total);
  // Returns for this order (voided ones too, for the history).
  const orderNotes = account.creditNotes.filter(
    (note) => note.saleId === sale.id,
  );
  const canReturn = canManage && isReturnable(sale.state);
  const person = sale.user.person;
  // Same calculation as on the by-zone screen.
  const { totals } = groupOrdersByZone([
    {
      cityId: 0,
      cityName: city.name,
      stateName: city.state.name,
      paymentMethod: sale.paymentMethod,
      total: sale.total,
      items: sale.items,
    },
  ]);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {interpolate(t.orders.detailTitle, { number: sale.number })}
        </h1>
        <span className="rounded border border-current/20 px-2 py-0.5 text-sm">
          {t.orders.states[sale.state]}
        </span>
      </div>

      {sale.creditHoldAt && sale.state !== "CANCELED" && (
        <CreditHoldBanner
          sale={sale}
          canManage={canManage}
          format={format}
          t={t.adminOrders.creditHold}
        />
      )}

      <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <OrderDetail label={t.orders.date}>
          {format.dateTime(sale.createdAt)}
        </OrderDetail>
        <OrderDetail label={t.adminOrders.detail.customer}>
          <Link
            href={`/admin/customers/${customer.id}`}
            className="hover:underline"
          >
            {customer.tradeName}
          </Link>
          <span className="block opacity-70">
            {customer.legalName} ·{" "}
            {interpolate(t.adminOrders.detail.cuit, {
              cuit: formatCuit(customer.cuit),
            })}
          </span>
        </OrderDetail>
        <OrderDetail label={t.adminOrders.detail.contact}>
          {person.name} {person.surname}
          <span className="block opacity-70">
            {[person.mail, person.phone].filter(Boolean).join(" · ")}
          </span>
        </OrderDetail>
        <OrderDetail label={t.orders.address}>
          {sale.address.name}
          <span className="block opacity-70">
            {[
              sale.address.address,
              sale.address.zipCode && `CP ${sale.address.zipCode}`,
            ]
              .filter(Boolean)
              .join(", ")}
          </span>
        </OrderDetail>
        <OrderDetail label={t.adminOrders.detail.zone}>
          {city.name}
          <span className="block opacity-70">{city.state.name}</span>
        </OrderDetail>
        <OrderDetail label={t.orders.payment}>
          {t.orders.paymentMethods[sale.paymentMethod]} ·{" "}
          {t.orders.paymentStates[sale.paymentState]}
        </OrderDetail>
        {sale.notes && (
          <OrderDetail label={t.orders.notes}>
            <span className="whitespace-pre-line">{sale.notes}</span>
          </OrderDetail>
        )}
      </dl>

      <OrderItems
        items={sale.items}
        subTotal={sale.subTotal}
        tax={sale.tax}
        discount={sale.discount}
        total={sale.total}
        locale={locale}
        format={format}
        t={t.cart}
      />
      <p className="mt-1 text-right text-xs opacity-70">
        {interpolate(t.adminOrders.detail.volume, {
          volume: format.number(totals.volume),
        })}
        {totals.missingVolume && ` · ${t.adminOrders.missingVolume}`}
      </p>

      {(proofs.length > 0 || sale.paymentMethod === "TRANSFER") && (
        <section className="mt-8 rounded border border-current/20 p-4 print:hidden">
          <h2 className="text-lg font-medium">{t.transfer.proofTitle}</h2>
          <TransferProofList
            proofs={proofs}
            format={format}
            t={t.transfer}
            actions={(proof) =>
              canManage && proof.state === "PENDING" ? (
                <ProofReviewForm
                  proofId={proof.id}
                  suggestedAmount={proofAmount}
                  today={today}
                  t={t.transfer}
                />
              ) : null
            }
          />
        </section>
      )}

      <OrderNotices
        sale={{ id: sale.id, number: sale.number, state: sale.state }}
        canManage={canManage}
        format={format}
        t={t}
        states={t.orders.states}
      />

      {(orderNotes.length > 0 || canReturn) && (
        <section className="mt-8 rounded border border-current/20 p-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium">
              {t.customerCreditNotes.ordersSection}
            </h2>
            {canReturn && (
              <Link
                href={`/admin/orders/${sale.number}/return`}
                className={buttonClass("secondary")}
              >
                {t.customerCreditNotes.returnButton}
              </Link>
            )}
          </div>
          <CreditNoteList
            notes={orderNotes}
            internal
            format={format}
            t={t.customerCreditNotes}
            actions={(note) =>
              canManage && !note.voidedAt ? (
                <VoidCreditNoteForm
                  noteId={note.id}
                  t={t.customerCreditNotes}
                />
              ) : null
            }
          />
        </section>
      )}

      <section className="mt-8 rounded border border-current/20 p-4 print:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium">{t.account.title}</h2>
          <Link
            href={`/admin/customers/${customer.id}/account`}
            className="text-sm hover:underline"
          >
            {t.account.viewAccount}
          </Link>
        </div>
        <BalanceLine
          balance={account.summary.balance}
          t={t.account}
          format={format}
        />
        <p className="text-sm opacity-70">
          {allocation && toCents(allocation.pending) > BigInt(0)
            ? interpolate(t.account.orderPending, {
                amount: format.money(allocation.pending),
              })
            : allocation
              ? t.account.orderPaid
              : null}
        </p>
        {canManage && (
          <div className="mt-4">
            <PaymentForm
              customerId={customer.id}
              saleId={sale.id}
              suggestedAmount={
                suggested > BigInt(0)
                  ? format.input(fromCents(suggested))
                  : undefined
              }
              maxRefund={
                toCents(account.summary.balance) < BigInt(0)
                  ? format.money(maxRefund(account.summary.balance))
                  : undefined
              }
              today={today}
              t={t.account}
              methods={t.orders.paymentMethods}
            />
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-8 md:grid-cols-2 print:hidden">
        <div>
          <h2 className="mb-3 text-lg font-medium">
            {t.adminOrders.stateChange.title}
          </h2>
          {canManage && sale.state === "PENDING" && (
            <div className="mb-6 rounded border border-current/20 p-3">
              <h3 className="mb-2 font-medium">
                {t.adminOrders.customerEdit.title}
              </h3>
              <CustomerEditControl
                saleId={sale.id}
                allowed={sale.customerCanEdit}
                editingBy={
                  sale.editingPerson
                    ? `${sale.editingPerson.name} ${sale.editingPerson.surname}`
                    : null
                }
                t={t.adminOrders.customerEdit}
              />
            </div>
          )}
          <StateChangeForm
            saleId={sale.id}
            current={sale.state}
            targets={allowedTransitions(sale.state).map((state) => ({
              state,
              back: isStepBack(sale.state, state),
              effect: stockEffect(sale.state, state),
            }))}
            items={sale.items.map((item) => ({
              productId: item.productId,
              name: item.product.name,
              quantity: `${format.number(item.quantity)} ${item.product.measurementUnit.name}`,
            }))}
            warehouses={warehouses}
            t={t.adminOrders.stateChange}
            states={t.orders.states}
          />
        </div>
        <div>
          <h2 className="mb-3 text-lg font-medium">
            {t.adminOrders.history.title}
          </h2>
          <History saleId={sale.id} />
        </div>
      </section>
    </>
  );
}

/** Why it was held and the button to approve it (or who approved it). */
function CreditHoldBanner({
  sale,
  canManage,
  format,
  t,
}: {
  sale: {
    id: string;
    creditHoldAt: Date | null;
    creditHoldReasons: unknown;
    creditReleasedAt: Date | null;
    creditReleaseNote: string | null;
    creditReleasedBy: { person: { name: string; surname: string } } | null;
  };
  canManage: boolean;
  format: ReturnType<typeof formatters>;
  t: Dictionary["adminOrders"]["creditHold"];
}) {
  const reasons = (sale.creditHoldReasons ?? {}) as CreditHoldReasons;
  const held = isOnCreditHold(sale);
  const by = sale.creditReleasedBy?.person;
  return (
    <section
      role={held ? "alert" : undefined}
      className={`mt-4 rounded border p-4 text-sm ${
        held
          ? "border-amber-600/50 bg-amber-500/10"
          : "border-current/20 opacity-80"
      }`}
    >
      <h2 className="font-medium">{t.title}</h2>
      {reasons.limit && (
        <p className="mt-1">
          {interpolate(t.limit, {
            exposure: format.money(reasons.limit.exposure),
            limit: format.money(reasons.limit.limit),
          })}
        </p>
      )}
      {reasons.overdue && (
        <p className="mt-1">
          {interpolate(t.overdue, {
            date: format.date(new Date(reasons.overdue.since)),
            days: reasons.overdue.termDays,
          })}
        </p>
      )}
      {held ? (
        <>
          <p className="mt-1 text-xs opacity-70">{t.hint}</p>
          {canManage && <CreditHoldControl saleId={sale.id} t={t} />}
        </>
      ) : (
        <p className="mt-1">
          {interpolate(t.released, {
            name: by ? `${by.name} ${by.surname}` : "—",
            date: format.dateTime(sale.creditReleasedAt!),
          })}
          {sale.creditReleaseNote && (
            <span className="block whitespace-pre-line opacity-80">
              {sale.creditReleaseNote}
            </span>
          )}
        </p>
      )}
    </section>
  );
}

/** Order confirmation and status changes, from the audit log. */
async function History({ saleId }: { saleId: string }) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const logs = await db.auditLog.findMany({
    where: { entityType: "SALE", entityId: saleId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      action: true,
      createdAt: true,
      before: true,
      after: true,
      metadata: true,
      actor: { select: { person: { select: { name: true, surname: true } } } },
    },
  });
  const stateOf = (value: unknown) =>
    (value as { state?: SaleState } | null)?.state;
  const commentOf = (value: unknown) =>
    (value as { comment?: string | null } | null)?.comment;
  const h = t.adminOrders.history;
  /** What happened, in words: status, edit permission or customer changes. */
  const describe = (
    log: (typeof logs)[number],
    from: SaleState | undefined,
    to: SaleState | undefined,
  ): string => {
    if (log.action === "CREATE") return h.created;
    const meta = (log.metadata ?? {}) as Record<string, unknown>;
    if (meta.editStarted) return h.editStarted;
    if (meta.editDiscarded) return h.editDiscarded;
    if (meta.editedByCustomer) return h.edited;
    if (meta.creditRelease) return h.creditReleased;
    if (meta.creditCheck) {
      const after = log.after as { creditHold?: unknown } | null;
      return after?.creditHold ? h.creditHeld : h.creditCleared;
    }
    const canEdit = (value: unknown) =>
      (value as { customerCanEdit?: boolean } | null)?.customerCanEdit;
    const before = canEdit(log.before);
    const after = canEdit(log.after);
    if (before !== undefined && after !== undefined && before !== after) {
      return after ? h.editAllowed : h.editRevoked;
    }
    if (from && to && from !== to) {
      return interpolate(h.changed, {
        from: t.orders.states[from],
        to: t.orders.states[to],
      });
    }
    return log.action;
  };

  return (
    <ol className="flex flex-col gap-3 border-l border-current/20 pl-4 text-sm">
      {logs.map((log) => {
        const from = stateOf(log.before);
        const to = stateOf(log.after);
        const comment = commentOf(log.metadata);
        const actor = log.actor?.person;
        return (
          <li key={log.id}>
            <p className="font-medium">{describe(log, from, to)}</p>
            <p className="text-xs opacity-70">
              {format.dateTime(log.createdAt)}
              {actor &&
                ` · ${interpolate(t.adminOrders.history.by, {
                  name: `${actor.name} ${actor.surname}`,
                })}`}
            </p>
            {comment && <p className="mt-1 whitespace-pre-line">{comment}</p>}
          </li>
        );
      })}
    </ol>
  );
}
