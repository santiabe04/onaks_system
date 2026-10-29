import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { formatters } from "@/i18n/format";
import { toMilli } from "@/lib/quantity";

/** Diferencia recibida (con signo, "2" / "-2.5"): de más, faltante u OK. */
export function DifferenceLabel({
  diff,
  t,
  format,
}: {
  diff: string;
  t: Dictionary["receipts"];
  format: ReturnType<typeof formatters>;
}) {
  const sign = toMilli(diff);
  if (sign === BigInt(0)) {
    return (
      <span className="text-green-700 dark:text-green-400">{t.exact}</span>
    );
  }
  return sign > BigInt(0) ? (
    <span className="font-medium text-amber-700 dark:text-amber-400">
      {interpolate(t.over, { quantity: format.number(diff) })}
    </span>
  ) : (
    <span className="text-red-600">
      {interpolate(t.short, { quantity: format.number(diff.slice(1)) })}
    </span>
  );
}
