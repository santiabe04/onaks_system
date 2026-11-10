import { fromMilli, toMilli } from "./quantity";

// Pure: lots and expiries. Quantities are in thousandths (BigInt), like
// the rest of the stock; dates are YYYY-MM-DD (calendar day, no time).

const ZERO = BigInt(0);

export const LOT_CODE_MAX_LENGTH = 40;
/** How many days in advance a lot is flagged as expiring soon. */
export const EXPIRY_WARNING_DAYS = 30;

export type LotBalance = {
  id: string;
  lotCode: string;
  /** YYYY-MM-DD. */
  expiresOn: string;
  quantity: string;
};

export type LotTake = { lotId: string; quantity: string };

/** The one that expires first first; on the same date, by code so it is stable. */
export function byExpiry(
  a: { expiresOn: string; lotCode: string },
  b: { expiresOn: string; lotCode: string },
): number {
  return (
    a.expiresOn.localeCompare(b.expiresOn) || a.lotCode.localeCompare(b.lotCode)
  );
}

/**
 * Splits an outgoing quantity across the lots, the one that expires first (FEFO).
 * `rest` is what the lots do not cover (stock with no lot): it is taken anyway from
 * the product's balance.
 */
export function allocateFefo(
  lots: LotBalance[],
  needed: string,
): { takes: LotTake[]; rest: string } {
  let left = toMilli(needed);
  const takes: LotTake[] = [];
  for (const lot of [...lots].sort(byExpiry)) {
    if (left <= ZERO) break;
    const available = toMilli(lot.quantity);
    if (available <= ZERO) continue;
    const take = available < left ? available : left;
    takes.push({ lotId: lot.id, quantity: fromMilli(take) });
    left -= take;
  }
  return { takes, rest: fromMilli(left > ZERO ? left : ZERO) };
}

/**
 * Returns a quantity to the lots it came from, without exceeding what
 * left each one. `taken` is what is still out of each lot.
 */
export function returnToLots(
  taken: LotTake[],
  amount: string,
): { puts: LotTake[]; rest: string } {
  let left = toMilli(amount);
  const puts: LotTake[] = [];
  for (const row of taken) {
    if (left <= ZERO) break;
    const out = toMilli(row.quantity);
    if (out <= ZERO) continue;
    const put = out < left ? out : left;
    puts.push({ lotId: row.lotId, quantity: fromMilli(put) });
    left -= put;
  }
  return { puts, rest: fromMilli(left > ZERO ? left : ZERO) };
}

export type ExpiryStatus = "expired" | "soon" | "ok";

/** Expired, expiring soon (within `warnDays`) or on the date. `today` is YYYY-MM-DD. */
export function expiryStatus(
  expiresOn: string,
  today: string,
  warnDays = EXPIRY_WARNING_DAYS,
): ExpiryStatus {
  if (expiresOn < today) return "expired";
  return expiresOn <= addDays(today, warnDays) ? "soon" : "ok";
}

/** Adds days to a YYYY-MM-DD (in UTC: there is no daylight saving time to move it). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Valid calendar date (rejects 2026-02-30). */
export function isValidDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** Sums the lots of several orders per product (same lot = a single row). */
export function sumLotsByProduct(
  rows: {
    productId: string;
    lotCode: string;
    expiresOn: string;
    quantity: string;
  }[],
): Map<string, { code: string; expiresOn: string; quantity: string }[]> {
  const byProduct = new Map<
    string,
    Map<string, { code: string; expiresOn: string; milli: bigint }>
  >();
  for (const row of rows) {
    const lots = byProduct.get(row.productId) ?? new Map();
    const key = `${row.lotCode}|${row.expiresOn}`;
    const current = lots.get(key) ?? {
      code: row.lotCode,
      expiresOn: row.expiresOn,
      milli: ZERO,
    };
    current.milli += toMilli(row.quantity);
    lots.set(key, current);
    byProduct.set(row.productId, lots);
  }
  return new Map(
    [...byProduct].map(([productId, lots]) => [
      productId,
      [...lots.values()].sort(byExpiry2).map((lot) => ({
        code: lot.code,
        expiresOn: lot.expiresOn,
        quantity: fromMilli(lot.milli),
      })),
    ]),
  );
}

function byExpiry2(
  a: { code: string; expiresOn: string },
  b: { code: string; expiresOn: string },
): number {
  return a.expiresOn.localeCompare(b.expiresOn) || a.code.localeCompare(b.code);
}

/** The day (YYYY-MM-DD) of a `@db.Date` column, which Prisma delivers at UTC midnight. */
export function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The lot code as it is stored: no extra spaces and in uppercase. */
export function normalizeLotCode(input: string): string {
  return input.trim().toUpperCase();
}
