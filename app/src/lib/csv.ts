// Pure: builds a CSV that Excel opens correctly.
//
// Excel in Spanish expects `;` as the separator (the comma is the decimal); in
// English, `,`. The BOM makes it respect accents (UTF-8).

const BOM = "\uFEFF";

export type CsvDelimiter = ";" | ",";

/**
 * A text that starts with `=`, `+`, `-`, `@` or a tab is taken by Excel as a
 * formula (injection: a customer comment like `=HYPERLINK(...)`). A `'` is
 * prepended to it, which Excel does not show. Numbers (`-12,5`) are left as they are.
 */
function neutralize(value: string): string {
  if (!/^[=+\-@\t\r]/.test(value)) return value;
  return /^-?\d+([.,]\d+)?$/.test(value) ? value : `'${value}`;
}

/** Quotes only when needed; internal quotes are doubled. */
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
 * "1234.5" → "1234,5" with decimal comma. No thousands separator: a spreadsheet
 * must be able to read it as a number.
 */
export function csvNumber(
  value: { toString(): string },
  decimalComma: boolean,
) {
  const text = value.toString();
  return decimalComma ? text.replace(".", ",") : text;
}
