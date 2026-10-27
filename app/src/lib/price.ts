// Puro: precio final a partir del neto y la alícuota. Lo usan el server (listas)
// y el form (vista previa), así que no depende del Decimal de Prisma.

type Numeric = string | number | { toString(): string };

// BigInt(...) y no literales `10_000n`: el target del tsconfig es anterior a ES2020.
const SCALE = BigInt(10_000); // 4 decimales de la alícuota
const HALF = BigInt(5_000);
const HUNDRED = BigInt(100);

/** "1234.5" → 123450n (centavos, o la escala que se pida). */
function toScaled(value: Numeric, scale: number): bigint {
  const [integer, decimals = ""] = String(value.toString()).split(".");
  return BigInt(integer + decimals.padEnd(scale, "0").slice(0, scale));
}

/**
 * Precio final = neto × (1 + alícuota), redondeado a centavos (mitad hacia
 * arriba). Con enteros: sin errores de coma flotante en la plata.
 */
export function finalPrice(net: Numeric, rate: Numeric): string {
  const cents = toScaled(net, 2);
  const basisPoints = toScaled(rate, 4); // 0.105 → 1050
  const rounded = (cents * (SCALE + basisPoints) + HALF) / SCALE;
  const whole = rounded / HUNDRED;
  const fraction = String(rounded % HUNDRED).padStart(2, "0");
  return `${whole}.${fraction}`;
}
