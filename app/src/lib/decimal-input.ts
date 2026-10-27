// Puro: números que tipea el usuario ("1250,5" o "1250.5") → string para un
// Decimal de Postgres, sin pasar por floats.

export type DecimalLimits = {
  /** Decimales máximos que admite la columna. */
  maxDecimals: number;
  /** Dígitos enteros máximos (precisión - escala de la columna). */
  maxIntegerDigits: number;
};

/**
 * "1250,5" → "1250.5". null si no es un número no negativo con esos límites.
 * Sin separador de miles: "1.250" sería ambiguo entre idiomas.
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

/** Precio: columna DECIMAL(12,2). */
export const PRICE_LIMITS: DecimalLimits = {
  maxDecimals: 2,
  maxIntegerDigits: 10,
};

/** Peso y volumen: columnas DECIMAL(10,3). */
export const MEASURE_LIMITS: DecimalLimits = {
  maxDecimals: 3,
  maxIntegerDigits: 7,
};
