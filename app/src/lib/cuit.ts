const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Saca guiones y espacios: "30-71234567-1" → "30712345671". */
export function normalizeCuit(input: string): string {
  return input.replace(/[\s-]/g, "");
}

/** Valida formato (11 dígitos) y dígito verificador de un CUIT/CUIL. */
export function isValidCuit(input: string): boolean {
  const cuit = normalizeCuit(input);
  if (!/^\d{11}$/.test(cuit)) return false;

  const digits = cuit.split("").map(Number);
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * digits[i], 0);
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? 0 : mod;

  // mod === 10 no tiene dígito verificador válido
  return expected !== 10 && expected === digits[10];
}
