// Puro: el período de pedidos que mira el admin, a partir de la URL.
//
// Por defecto es la semana actual de **sábado a sábado**: las rutas de reparto
// se planifican el fin de semana con lo que se pidió en la semana. También se
// puede elegir un rango libre (desde / hasta, inclusive).

// Días calendario de Argentina, que no tiene horario de verano: offset fijo.
const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SATURDAY = 6;
/** Un rango libre más largo se recorta: la pantalla no es un reporte anual. */
export const MAX_RANGE_DAYS = 93;

export type OrderPeriod = {
  mode: "week" | "range";
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
  /** YYYY-MM-DD de Argentina: primer y último día que entran. */
  from: string;
  to: string;
  /** Solo en modo semana: el sábado de la semana anterior y de la siguiente. */
  previousWeek?: string;
  nextWeek?: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

/** "2026-10-24" → 00:00 de ese día en Argentina. */
function dayStart(raw: string | undefined): Date | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const utc = Date.parse(`${raw}T00:00:00Z`);
  if (Number.isNaN(utc)) return undefined;
  const date = new Date(utc - TZ_OFFSET_MS);
  // Date.parse acepta "2026-02-31": se descarta comparando con el original.
  return isoDay(date) === raw ? date : undefined;
}

/** El día de Argentina de un instante, como YYYY-MM-DD. */
export function isoDay(date: Date): string {
  return new Date(date.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** 00:00 (Argentina) del sábado en que empieza la semana de `date`. */
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
 * `?from=&to=` → rango libre; `?week=YYYY-MM-DD` → la semana que contiene ese
 * día; nada (o algo que no se entiende) → la semana de `now`.
 */
export function parseOrderPeriod(
  params: SearchParams,
  now: Date = new Date(),
): OrderPeriod {
  let from = dayStart(first(params.from));
  let to = dayStart(first(params.to));
  if (from || to) {
    // Con un solo extremo, el otro es el mismo día.
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

/** Query string que reproduce el período (vacío para la semana actual). */
export function periodQuery(period: OrderPeriod, now: Date = new Date()) {
  if (period.mode === "range") {
    return `?${new URLSearchParams({ from: period.from, to: period.to })}`;
  }
  return period.from === isoDay(weekStart(now)) ? "" : `?week=${period.from}`;
}
