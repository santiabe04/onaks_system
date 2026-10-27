/** Los ids de las tablas de negocio son CUID2: alcanza con descartar lo que obviamente no es uno. */
export function isCuid(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{1,32}$/.test(value);
}
