// Puro: arma un CSV que Excel abre bien.
//
// Excel en español espera `;` como separador (la coma es el decimal); en
// inglés, `,`. El BOM hace que respete los acentos (UTF-8).

const BOM = "\uFEFF";

export type CsvDelimiter = ";" | ",";

/** Comillas solo cuando hacen falta; las comillas internas se duplican. */
function cell(value: string, delimiter: CsvDelimiter): string {
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
