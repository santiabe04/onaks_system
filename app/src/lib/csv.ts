// Puro: arma un CSV que Excel abra bien.
//
// En español, Excel (configuración regional de Argentina) usa ";" como
// separador de listas y "," como decimal; en inglés, "," y ".". Por eso el
// separador depende del idioma y los números se pasan ya formateados.

// Marca de orden de bytes: así Excel reconoce UTF-8 (los acentos).
const BOM = String.fromCharCode(0xfeff);

export type CsvCell = string | number | null | undefined;

/** Comillas solo cuando hace falta; las internas se duplican. */
function escape(cell: CsvCell, separator: string): string {
  const text = cell == null ? "" : String(cell);
  // Una celda que empieza con =, +, - o @ Excel la toma como fórmula.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /["\r\n]/.test(safe) || safe.includes(separator)
    ? `"${safe.replaceAll('"', '""')}"`
    : safe;
}

/**
 * Filas → texto CSV con BOM (para que Excel reconozca UTF-8 y los acentos)
 * y fin de línea CRLF, como pide el RFC 4180.
 */
export function toCsv(rows: CsvCell[][], separator: "," | ";"): string {
  const lines = rows.map((row) =>
    row.map((cell) => escape(cell, separator)).join(separator),
  );
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
