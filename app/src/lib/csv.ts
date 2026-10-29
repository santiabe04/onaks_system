// Puro: arma un CSV que Excel abre bien.
//
// Excel en español espera `;` como separador (la coma es el decimal); en
// inglés, `,`. El BOM hace que respete los acentos (UTF-8).

const BOM = "\uFEFF";

export type CsvDelimiter = ";" | ",";

/**
 * Un texto que arranca con `=`, `+`, `-`, `@` o un tab Excel lo toma como
 * fórmula (inyección: un comentario del cliente como `=HYPERLINK(...)`). Se le
 * antepone `'`, que Excel no muestra. Los números (`-12,5`) quedan como están.
 */
function neutralize(value: string): string {
  if (!/^[=+\-@\t\r]/.test(value)) return value;
  return /^-?\d+([.,]\d+)?$/.test(value) ? value : `'${value}`;
}

/** Comillas solo cuando hacen falta; las comillas internas se duplican. */
function cell(raw: string, delimiter: CsvDelimiter): string {
  const value = neutralize(raw);
  return value.includes(delimiter) || /["\r\n]/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

export function toCsv(rows: string[][], delimiter: CsvDelimiter): string {
  return (
    BOM +
    rows
      .map((row) => row.map((value) => cell(value, delimiter)).join(delimiter))
      .join("\r\n") +
    "\r\n"
  );
}

/**
 * "1234.5" → "1234,5" con coma decimal. Sin separador de miles: una planilla
 * lo tiene que poder leer como número.
 */
export function csvNumber(
  value: { toString(): string },
  decimalComma: boolean,
) {
  const text = value.toString();
  return decimalComma ? text.replace(".", ",") : text;
}
