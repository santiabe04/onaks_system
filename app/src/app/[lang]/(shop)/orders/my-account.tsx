import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { formatters } from "@/i18n/format";
import { fromCents, toCents } from "@/lib/account";
import { loadAccount } from "@/lib/account-ledger";
import { db } from "@/lib/db";

const RECENT_PAYMENTS = 5;

/**
 * Saldo de la empresa y sus últimos pagos, para el cliente. Sin datos
 * internos: ni quién cargó el cobro ni los anulados.
 */
export async function MyAccount({
  customerId,
  t,
  methods,
  format,
}: {
  customerId: string;
  t: Dictionary["myAccount"];
  methods: Dictionary["orders"]["paymentMethods"];
  format: ReturnType<typeof formatters>;
}) {
  const { summary, payments } = await loadAccount(db, customerId);
  const cents = toCents(summary.balance);
  const recent = payments
    .filter((payment) => !payment.voidedAt)
    .slice(-RECENT_PAYMENTS)
    .reverse();

  return (
    <section className="mt-6 rounded border border-current/20 p-4">
      <h2 className="text-sm font-medium opacity-70">{t.title}</h2>
      <p
        className={`text-xl font-semibold ${cents > BigInt(0) ? "text-red-600" : ""}`}
      >
        {cents > BigInt(0)
          ? interpolate(t.owes, { amount: format.money(summary.balance) })
          : cents < BigInt(0)
            ? interpolate(t.credit, { amount: format.money(fromCents(-cents)) })
            : t.settled}
      </p>
      <p className="text-xs opacity-70">{t.hint}</p>

      <h3 className="mt-3 text-sm font-medium">{t.payments}</h3>
      {recent.length === 0 ? (
        <p className="text-sm opacity-70">{t.noPayments}</p>
      ) : (
        <ul className="mt-1 text-sm">
          {recent.map((payment) => (
            <li key={payment.id} className="flex justify-between gap-4">
              <span>
                {format.date(
                  // `paid_on` es una fecha sin hora: se muestra el mismo día.
                  new Date(
                    `${payment.paidOn.toISOString().slice(0, 10)}T12:00:00-03:00`,
                  ),
                )}{" "}
                · {t.kinds[payment.kind]} · {methods[payment.method]}
              </span>
              <span className="whitespace-nowrap">
                {payment.kind === "REFUND" ? "−" : ""}
                {format.money(payment.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
