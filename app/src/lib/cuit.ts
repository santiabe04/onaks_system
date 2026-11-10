const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Removes dashes and spaces: "30-71234567-1" → "30712345671". */
export function normalizeCuit(input: string): string {
  return input.replace(/[\s-]/g, "");
}

/** "30712345671" → "30-71234567-1". If it does not have 11 digits, it returns it as is. */
export function formatCuit(cuit: string): string {
  return /^\d{11}$/.test(cuit)
    ? `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`
    : cuit;
}

/** Validates the format (11 digits) and the check digit of a CUIT/CUIL. */
export function isValidCuit(input: string): boolean {
  const cuit = normalizeCuit(input);
  if (!/^\d{11}$/.test(cuit)) return false;

  const digits = cuit.split("").map(Number);
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * digits[i], 0);
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? 0 : mod;

  // mod === 10 has no valid check digit
  return expected !== 10 && expected === digits[10];
}
