import { dayStart, isoDay } from "./order-period";
import { fromMilli, toMilli } from "./quantity";

// Puro: período, filtros y cuentas del reporte de ventas y margen. Todo en
// enteros (centavos y milésimas con BigInt), igual que los totales del pedido.

const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Hasta un año: alcanza para comparar contra el mismo mes del año anterior. */
export const MAX_REPORT_DAYS = 366;

/** Qué cuenta como venta: lo entregado (por fecha de entrega) o todo lo confirmado. */
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
  /** YYYY-MM-DD de Argentina, inclusive los dos. */
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

/** Primer día del mes (Argentina) de `date`. */
function monthStart(date: Date): Date {
  const local = new Date(date.getTime() + TZ_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - TZ_OFFSET_MS,
  );
}

/** Primer día del mes siguiente (Argentina). */
function nextMonth(date: Date): Date {
  const local = new Date(date.getTime() + TZ_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - TZ_OFFSET_MS,
  );
}

/**
 * `?from=&to=&basis=&tab=`. Sin fechas: el mes de `now`. Un rango de más de
 * un año se recorta desde `from`.
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

/** Query string del reporte con cambios (para pestañas, filtros y el CSV). */
export function reportQuery(
  params: ReportParams,
  changes: Partial<Pick<ReportParams, "from" | "to" | "basis" | "tab">> = {},
): string {
  const { from, to, basis, tab } = { ...params, ...changes };
  return `?${new URLSearchParams({ from, to, basis, tab })}`;
}

/**
 * Los 12 meses que terminan en el de `to`, como YYYY-MM, y el rango que
 * cubren: la evolución mensual del gráfico.
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

/** Un ítem vendido, con lo que hace falta para agruparlo. */
export type ReportLine = {
  saleId: string;
  productId: string;
  categoryId: number;
  customerId: string;
  cityId: number;
  quantity: { toString(): string };
  /** Neto unitario cobrado. */
  unitPrice: { toString(): string };
  /** Costo unitario al vender; null si el producto no tenía costo. */
  unitCost: { toString(): string } | null;
};

/** Una fila del reporte (o los totales). Plata como "1234.50". */
export type ReportRow = {
  key: string;
  /** Suma de cantidades: solo tiene sentido por producto. */
  quantity: string;
  orders: number;
  net: string;
  /** Costo de las líneas que tienen costo. */
  cost: string;
  /** Venta con costo − costo. */
  margin: string;
  /** Margen sobre la venta con costo (0.25 = 25 %); null si no hay costo. */
  marginRate: number | null;
  /** Venta de líneas sin costo: no entra en el margen. */
  uncostedNet: string;
};

const ZERO = BigInt(0);
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

/** precio × cantidad a centavos, mitad hacia arriba (como `lineTotals`). */
function lineCents(price: { toString(): string }, quantity: bigint): bigint {
  return (cents(price) * quantity + HALF_MILLI) / MILLI;
}

type Accumulator = {
  quantity: bigint;
  orders: Set<string>;
  net: bigint;
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
    cost: money(acc.cost),
    margin: money(margin),
    // Los dos en centavos: el cociente no depende de la unidad.
    marginRate: costed > ZERO ? Number(margin) / Number(costed) : null,
    uncostedNet: money(acc.uncosted),
  };
}

/**
 * Agrupa las líneas por `keyOf` y ordena de mayor a menor venta. Las líneas
 * sin costo suman a la venta pero no al margen (se informan aparte).
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
        cost: ZERO,
        uncosted: ZERO,
      };
      groups.set(key, acc);
    }
    const quantity = toMilli(line.quantity);
    const net = lineCents(line.unitPrice, quantity);
    acc.quantity += quantity;
    acc.orders.add(line.saleId);
    acc.net += net;
    if (line.unitCost === null) acc.uncosted += net;
    else acc.cost += lineCents(line.unitCost, quantity);
  }
  return [...groups]
    .map(([key, acc]) => toRow(key, acc))
    .sort(
      (a, b) =>
        Number(cents(b.net) - cents(a.net)) || a.key.localeCompare(b.key),
    );
}

/** Totales del período (una sola fila). */
export function reportTotals(lines: ReportLine[]): ReportRow {
  return (
    summarizeBy(lines, () => "")[0] ??
    toRow("", {
      quantity: ZERO,
      orders: new Set(),
      net: ZERO,
      cost: ZERO,
      uncosted: ZERO,
    })
  );
}
