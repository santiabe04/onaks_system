import { fromMilli, toMilli } from "./quantity";

// Puro: lotes y vencimientos. Las cantidades van en milésimas (BigInt), como
// el resto del stock; las fechas son YYYY-MM-DD (día calendario, sin hora).

const ZERO = BigInt(0);

export const LOT_CODE_MAX_LENGTH = 40;
/** Con cuántos días de anticipación se avisa que un lote está por vencer. */
export const EXPIRY_WARNING_DAYS = 30;

export type LotBalance = {
  id: string;
  lotCode: string;
  /** YYYY-MM-DD. */
  expiresOn: string;
  quantity: string;
};

export type LotTake = { lotId: string; quantity: string };

/** Primero lo que vence antes; a igual fecha, por código para que sea estable. */
export function byExpiry(
  a: { expiresOn: string; lotCode: string },
  b: { expiresOn: string; lotCode: string },
): number {
  return (
    a.expiresOn.localeCompare(b.expiresOn) || a.lotCode.localeCompare(b.lotCode)
  );
}

/**
 * Reparte una salida entre los lotes, primero el que vence antes (FEFO).
 * `rest` es lo que no cubren los lotes (stock sin lote): se saca igual del
 * saldo del producto.
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
 * Devuelve una cantidad a los lotes de donde salió, sin pasarse de lo que
 * salió de cada uno. `taken` es lo que sigue fuera de cada lote.
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

/** Vencido, por vencer (dentro de `warnDays`) o en fecha. `today` es YYYY-MM-DD. */
export function expiryStatus(
  expiresOn: string,
  today: string,
  warnDays = EXPIRY_WARNING_DAYS,
): ExpiryStatus {
  if (expiresOn < today) return "expired";
  return expiresOn <= addDays(today, warnDays) ? "soon" : "ok";
}

/** Suma días a un YYYY-MM-DD (en UTC: no hay horario de verano que lo mueva). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Fecha de calendario válida (rechaza 2026-02-30). */
export function isValidDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** Suma por producto los lotes de varios pedidos (mismo lote = una sola fila). */
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

/** El día (YYYY-MM-DD) de una columna `@db.Date`, que Prisma entrega a medianoche UTC. */
export function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** El código de lote como se guarda: sin espacios sobrantes y en mayúsculas. */
export function normalizeLotCode(input: string): string {
  return input.trim().toUpperCase();
}
