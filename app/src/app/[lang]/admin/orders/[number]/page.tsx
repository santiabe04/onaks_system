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
import { CustomerEditControl } from "./customer-edit-control";
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
    <main className="mx-auto w-full max-w-4xl p-8">
      <Link href="/admin/orders" className="text-sm hover:underline">
        {t.adminOrders.detail.back}
      </Link>
      {/* params y la query a la DB son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Order params={params} />
      </Suspense>
    </main>
  );
}

// Detalle + cambio de estado (con descuento/devolución de stock) e historial.
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

  // Para descontar stock: solo depósitos activos.
  const warehouses = await db.warehouse.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const { customer, city } = sale.address;
  // Cuenta corriente: lo que debe el cliente y cuánto falta de este pedido.
  await connection();
  const today = isoDay(new Date());
  const account = await loadAccount(db, customer.id);
  const allocation = account.summary.sales[sale.id];
  const debt = toCents(account.summary.balance);
  // Al cobrar se sugiere la deuda y, si el pedido todavía no es deuda, lo que falta de él.
  const suggested =
    (debt > BigInt(0) ? debt : BigInt(0)) +
    (allocation && !isCharged(sale.state)
      ? toCents(allocation.pending)
      : BigInt(0));
  const canManage = can(user.role, "sales:manage");
  const person = sale.user.person;
  // Mismo cálculo que en la pantalla por zona.
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

/** Confirmación y cambios de estado del pedido, desde la auditoría. */
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
  /** Qué pasó, en palabras: estado, permiso de modificar o cambios del cliente. */
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
