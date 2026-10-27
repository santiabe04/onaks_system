import { INTL_LOCALE, type Locale } from "./config";

// La moneda es siempre ARS: el idioma cambia el formato, no los datos.
const CURRENCY = "ARS";

/** Prisma devuelve Decimal: se acepta cualquier cosa que se pueda pasar a número. */
type Numeric = number | string | { toString(): string };

export function formatters(locale: Locale) {
  const tag = INTL_LOCALE[locale];
  const money = new Intl.NumberFormat(tag, {
    style: "currency",
    currency: CURRENCY,
  });
  const number = new Intl.NumberFormat(tag, { maximumFractionDigits: 3 });
  const date = new Intl.DateTimeFormat(tag, { dateStyle: "short" });
  const dateTime = new Intl.DateTimeFormat(tag, {
    dateStyle: "short",
    timeStyle: "short",
  });

  return {
    money: (value: Numeric) => money.format(Number(value.toString())),
    number: (value: Numeric) => number.format(Number(value.toString())),
    date: (value: Date) => date.format(value),
    dateTime: (value: Date) => dateTime.format(value),
  };
}
