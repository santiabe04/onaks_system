// Pure: numbers the user types ("1250,5" or "1250.5") → a string for a
// Postgres Decimal, without going through floats.

export type DecimalLimits = {
  /** Maximum decimals the column accepts. */
  maxDecimals: number;
  /** Maximum integer digits (column precision − scale). */
  maxIntegerDigits: number;
};

/**
 * "1250,5" → "1250.5". null if it is not a non-negative number within those limits.
 * No thousands separator: "1.250" would be ambiguous between languages.
 */
export function parseDecimalInput(
  raw: string,
  limits: DecimalLimits,
): string | null {
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(raw.trim());
  if (!match) return null;
  const integer = match[1].replace(/^0+(?=\d)/, "");
  const decimals = match[2] ?? "";
  if (integer.length > limits.maxIntegerDigits) return null;
  if (decimals.length > limits.maxDecimals) return null;
  return decimals ? `${integer}.${decimals}` : integer;
}

/** Price: DECIMAL(12,2) column. */
export const PRICE_LIMITS: DecimalLimits = {
  maxDecimals: 2,
  maxIntegerDigits: 10,
};

/** Weight and volume: DECIMAL(10,3) columns. */
export const MEASURE_LIMITS: DecimalLimits = {
  maxDecimals: 3,
  maxIntegerDigits: 7,
};
