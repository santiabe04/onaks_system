// Pure: the order period the admin looks at, from the URL.
//
// By default it is the current week from **Saturday to Saturday**: delivery routes
// are planned over the weekend with what was ordered during the week. A free
// range can also be chosen (from / to, inclusive).

// Argentina calendar days, which has no daylight saving time: fixed offset.
const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SATURDAY = 6;
/** A longer free range is trimmed: the screen is not an annual report. */
export const MAX_RANGE_DAYS = 93;

export type OrderPeriod = {
  mode: "week" | "range";
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
  /** YYYY-MM-DD in Argentina: the first and last day that are included. */
  from: string;
  to: string;
  /** Only in week mode: the Saturday of the previous and the next week. */
  previousWeek?: string;
  nextWeek?: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

/** "2026-10-24" → 00:00 of that day in Argentina. */
export function dayStart(raw: string | undefined): Date | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const utc = Date.parse(`${raw}T00:00:00Z`);
  if (Number.isNaN(utc)) return undefined;
  const date = new Date(utc - TZ_OFFSET_MS);
  // Date.parse accepts "2026-02-31": it is discarded by comparing with the original.
  return isoDay(date) === raw ? date : undefined;
}

/** The Argentina day of an instant, as YYYY-MM-DD. */
export function isoDay(date: Date): string {
  return new Date(date.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** 00:00 (Argentina) of the Saturday on which the week of `date` begins. */
export function weekStart(date: Date): Date {
  const local = new Date(date.getTime() + TZ_OFFSET_MS);
  const daysSinceSaturday = (local.getUTCDay() - SATURDAY + 7) % 7;
  const midnight = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - daysSinceSaturday,
  );
  return new Date(midnight - TZ_OFFSET_MS);
}

function week(start: Date): OrderPeriod {
  const end = new Date(start.getTime() + 7 * DAY_MS);
  return {
    mode: "week",
    start,
    end,
    from: isoDay(start),
    to: isoDay(new Date(end.getTime() - DAY_MS)),
    previousWeek: isoDay(new Date(start.getTime() - 7 * DAY_MS)),
    nextWeek: isoDay(end),
  };
}

/**
 * `?from=&to=` → free range; `?week=YYYY-MM-DD` → the week that contains that
 * day; nothing (or something not understood) → the week of `now`.
 */
export function parseOrderPeriod(
  params: SearchParams,
  now: Date = new Date(),
): OrderPeriod {
  let from = dayStart(first(params.from));
  let to = dayStart(first(params.to));
  if (from || to) {
    // With only one end, the other is the same day.
    from ??= to!;
    to ??= from;
    if (to < from) [from, to] = [to, from];
    const maxTo = new Date(from.getTime() + (MAX_RANGE_DAYS - 1) * DAY_MS);
    if (to > maxTo) to = maxTo;
    return {
      mode: "range",
      start: from,
      end: new Date(to.getTime() + DAY_MS),
      from: isoDay(from),
      to: isoDay(to),
    };
  }
  return week(weekStart(dayStart(first(params.week)) ?? now));
}

/** Query string that reproduces the period (empty for the current week). */
export function periodQuery(period: OrderPeriod, now: Date = new Date()) {
  if (period.mode === "range") {
    return `?${new URLSearchParams({ from: period.from, to: period.to })}`;
  }
  return period.from === isoDay(weekStart(now)) ? "" : `?week=${period.from}`;
}
