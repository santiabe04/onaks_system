import { dayStart, isoDay } from "./order-period";
import { fromMilli, toMilli } from "./quantity";

// Pure: period, filters and accounts of the sales and margin report. Everything in
// integers (cents and thousandths with BigInt), like the order totals.

const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Up to one year: enough to compare against the same month of the previous year. */
export const MAX_REPORT_DAYS = 366;

/** What counts as a sale: what was delivered (by delivery date) or everything confirmed. */
export const REPORT_BASES = ["delivered", "confirmed"] as const;
export type ReportBasis = (typeof REPORT_BASES)[number];

export const REPORT_TABS = [
  "products",
  "categories",
  "customers",
  "zones",
  "idle",
] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

export type ReportParams = {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
  /** YYYY-MM-DD in Argentina, both inclusive. */
  from: string;
  to: string;
  basis: ReportBasis;
  tab: ReportTab;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

function oneOf<T extends string>(
  values: readonly T[],
  raw: string | undefined,
  fallback: T,
): T {
  return values.includes(raw as T) ? (raw as T) : fallback;
}

/** First day of the month (Argentina) of `date`. */
function monthStart(date: Date): Date {
  const local = new Date(date.getTime() + TZ_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - TZ_OFFSET_MS,
  );
}

/** First day of the next month (Argentina). */
function nextMonth(date: Date): Date {
  const local = new Date(date.getTime() + TZ_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - TZ_OFFSET_MS,
  );
}

/**
 * `?from=&to=&basis=&tab=`. Without dates: the month of `now`. A range of more than
 * one year is trimmed from `from`.
 */
export function parseReportParams(
  params: SearchParams,
  now: Date = new Date(),
): ReportParams {
  let from = dayStart(first(params.from));
  let to = dayStart(first(params.to));
  if (!from && !to) {
    from = monthStart(now);
    to = new Date(nextMonth(now).getTime() - DAY_MS);
  }
  from ??= to!;
  to ??= from;
  if (to < from) [from, to] = [to, from];
  const maxTo = new Date(from.getTime() + (MAX_REPORT_DAYS - 1) * DAY_MS);
  if (to > maxTo) to = maxTo;
  return {
    start: from,
    end: new Date(to.getTime() + DAY_MS),
    from: isoDay(from),
    to: isoDay(to),
    basis: oneOf(REPORT_BASES, first(params.basis), "delivered"),
    tab: oneOf(REPORT_TABS, first(params.tab), "products"),
  };
}

/** The report's query string with changes (for tabs, filters and the CSV). */
export function reportQuery(
  params: ReportParams,
  changes: Partial<Pick<ReportParams, "from" | "to" | "basis" | "tab">> = {},
): string {
  const { from, to, basis, tab } = { ...params, ...changes };
  return `?${new URLSearchParams({ from, to, basis, tab })}`;
}

/**
 * The 12 months ending with the one of `to`, as YYYY-MM, and the range they
 * cover: the monthly evolution of the chart.
 */
export function chartMonths(params: ReportParams): {
  months: string[];
  start: Date;
  end: Date;
} {
  const end = nextMonth(new Date(params.end.getTime() - DAY_MS));
  const months: string[] = [];
  let cursor = end;
  for (let i = 0; i < 12; i++) {
    cursor = monthStart(new Date(cursor.getTime() - DAY_MS));
    months.unshift(isoDay(cursor).slice(0, 7));
  }
  return { months, start: cursor, end };
}

/**
 * A sold or returned item, with what is needed to group it. A return
 * (`kind: "return"`, from a valid credit note) subtracts on the
 * note's date, with the price and cost of the original order.
 */
export type ReportLine = {
  kind: "sale" | "return";
  /** Only for returns: what was done with the goods. */
  destination: "RESTOCK" | "WRITE_OFF" | null;
  saleId: string;
  productId: string;
  categoryId: number;
  customerId: string;
  cityId: number;
  quantity: { toString(): string };
  /** Unit net price charged. */
  unitPrice: { toString(): string };
  /** Unit cost when sold; null if the product had no cost. */
  unitCost: { toString(): string } | null;
};

/** A report row (or the totals). Money as "1234.50". */
export type ReportRow = {
  key: string;
  /** Sum of quantities: it only makes sense per product. */
  quantity: string;
  /** Different orders with sales (returns do not add orders). */
  orders: number;
  /** Net sales of returns. */
  net: string;
  /** What was returned in the period (net, positive): already subtracted from `net`. */
  returned: string;
  /** Cost of the lines that have a cost. */
  cost: string;
  /** Sale with cost − cost. */
  margin: string;
  /** Margin on the sale with a cost (0.25 = 25 %); null if there is no cost. */
  marginRate: number | null;
  /** Sale of lines without a cost: it does not enter the margin. */
  uncostedNet: string;
};

const ZERO = BigInt(0);
const ONE = BigInt(1);
const HALF_MILLI = BigInt(500);
const MILLI = BigInt(1000);
const HUNDRED = BigInt(100);

function cents(value: { toString(): string }): bigint {
  const [integer, decimals = ""] = value.toString().split(".");
  return BigInt(integer + decimals.padEnd(2, "0").slice(0, 2));
}

function money(value: bigint): string {
  const sign = value < ZERO ? "-" : "";
  const abs = value < ZERO ? -value : value;
  return `${sign}${abs / HUNDRED}.${String(abs % HUNDRED).padStart(2, "0")}`;
}

/** price × quantity to cents, half up (like `lineTotals`). */
function lineCents(price: { toString(): string }, quantity: bigint): bigint {
  return (cents(price) * quantity + HALF_MILLI) / MILLI;
}

type Accumulator = {
  quantity: bigint;
  orders: Set<string>;
  net: bigint;
  returned: bigint;
  cost: bigint;
  uncosted: bigint;
};

function toRow(key: string, acc: Accumulator): ReportRow {
  const costed = acc.net - acc.uncosted;
  const margin = costed - acc.cost;
  return {
    key,
    quantity: fromMilli(acc.quantity),
    orders: acc.orders.size,
    net: money(acc.net),
    returned: money(acc.returned),
    cost: money(acc.cost),
    margin: money(margin),
    // Both in cents: the quotient does not depend on the unit.
    marginRate: costed > ZERO ? Number(margin) / Number(costed) : null,
    uncostedNet: money(acc.uncosted),
  };
}

/**
 * Groups the lines by `keyOf` and sorts from highest to lowest sale. Lines
 * without a cost add to the sale but not to the margin (they are reported separately). Returns
 * subtract: what goes back to stock reverses the sale and the cost; what
 * is written off reverses the sale but not the cost (the goods
 * were lost, so the loss stays in the margin).
 */
export function summarizeBy(
  lines: ReportLine[],
  keyOf: (line: ReportLine) => string,
): ReportRow[] {
  const groups = new Map<string, Accumulator>();
  for (const line of lines) {
    const key = keyOf(line);
    let acc = groups.get(key);
    if (!acc) {
      acc = {
        quantity: ZERO,
        orders: new Set(),
        net: ZERO,
        returned: ZERO,
        cost: ZERO,
        uncosted: ZERO,
      };
      groups.set(key, acc);
    }
    const isReturn = line.kind === "return";
    const sign = isReturn ? -ONE : ONE;
    const quantity = toMilli(line.quantity);
    const net = lineCents(line.unitPrice, quantity);
    acc.quantity += sign * quantity;
    acc.net += sign * net;
    if (isReturn) acc.returned += net;
    else acc.orders.add(line.saleId);
    if (line.unitCost === null) {
      acc.uncosted += sign * net;
    } else if (!isReturn || line.destination === "RESTOCK") {
      acc.cost += sign * lineCents(line.unitCost, quantity);
    }
  }
  return [...groups]
    .map(([key, acc]) => toRow(key, acc))
    .sort(
      (a, b) =>
        Number(cents(b.net) - cents(a.net)) || a.key.localeCompare(b.key),
    );
}

/** Period totals (a single row). */
export function reportTotals(lines: ReportLine[]): ReportRow {
  return (
    summarizeBy(lines, () => "")[0] ??
    toRow("", {
      quantity: ZERO,
      orders: new Set(),
      net: ZERO,
      returned: ZERO,
      cost: ZERO,
      uncosted: ZERO,
    })
  );
}
