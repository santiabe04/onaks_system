import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { formatters } from "@/i18n/format";
import { fromCents, toCents } from "@/lib/account";

/** "Owes $ 10.000" (in red), "Credit balance $ 2.000" or "Up to date". */
export function BalanceLine({
  balance,
  t,
  format,
  large,
}: {
  balance: string;
  t: Dictionary["account"];
  format: ReturnType<typeof formatters>;
  large?: boolean;
}) {
  const cents = toCents(balance);
  const text =
    cents > BigInt(0)
      ? interpolate(t.owes, { amount: format.money(balance) })
      : cents < BigInt(0)
        ? interpolate(t.credit, { amount: format.money(fromCents(-cents)) })
        : t.settled;
  return (
    <p
      className={`font-semibold ${large ? "text-2xl" : ""} ${
        cents > BigInt(0) ? "text-red-600" : ""
      }`}
    >
      {text}
    </p>
  );
}
