import { INTL_LOCALE, type Locale } from "./config";

// The currency is always ARS: the language changes the format, not the data.
const CURRENCY = "ARS";

/** Prisma returns Decimal: anything that can be passed to a number is accepted. */
type Numeric = number | string | { toString(): string };

export function formatters(locale: Locale) {
  const tag = INTL_LOCALE[locale];
  const money = new Intl.NumberFormat(tag, {
    style: "currency",
    currency: CURRENCY,
  });
  const number = new Intl.NumberFormat(tag, { maximumFractionDigits: 3 });
  const input = new Intl.NumberFormat(tag, {
    useGrouping: false,
    maximumFractionDigits: 3,
  });
  const percent = new Intl.NumberFormat(tag, {
    style: "percent",
    maximumFractionDigits: 2,
  });
  const date = new Intl.DateTimeFormat(tag, { dateStyle: "short" });
  const time = new Intl.DateTimeFormat(tag, { timeStyle: "short" });
  const dateTime = new Intl.DateTimeFormat(tag, {
    dateStyle: "short",
    timeStyle: "short",
  });

  return {
    money: (value: Numeric) => money.format(Number(value.toString())),
    number: (value: Numeric) => number.format(Number(value.toString())),
    /** To pre-fill an input: the language's decimal separator, without thousands ("25000,5"). */
    input: (value: Numeric) => input.format(Number(value.toString())),
    /** Takes a fraction (0.105 → "10,5 %"), as rates are stored. */
    percent: (value: Numeric) => percent.format(Number(value.toString())),
    date: (value: Date) => date.format(value),
    /** A calendar day (YYYY-MM-DD, like a lot's expiry), without time zone shifts. */
    day: (iso: string) => date.format(new Date(`${iso}T12:00:00`)),
    time: (value: Date) => time.format(value),
    dateTime: (value: Date) => dateTime.format(value),
  };
}
