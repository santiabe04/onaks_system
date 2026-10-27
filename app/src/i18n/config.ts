// Sin `server-only`: lo usan el proxy, las Server Actions y los Client Components.

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

/** Tag BCP 47 para `Intl` y `<html lang>`. */
export const INTL_LOCALE: Record<Locale, string> = {
  es: "es-AR",
  en: "en-US",
};

export function hasLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Idioma de la instalación (`APP_LOCALE`), leído en runtime: la misma imagen
 * sirve para las dos. Un valor inválido rompe en vez de caer en el default,
 * para que el error de configuración se note.
 */
export function appLocale(): Locale {
  const value = process.env.APP_LOCALE?.trim() || DEFAULT_LOCALE;
  if (!hasLocale(value)) {
    throw new Error(
      `APP_LOCALE inválido: "${value}". Valores posibles: ${LOCALES.join(", ")}`,
    );
  }
  return value;
}

/** Ruta pública → ruta interna bajo `app/[lang]` ("/login" → "/es/login"). */
export function localizePath(pathname: string, locale: Locale): string {
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

/**
 * Inversa de `localizePath`. Al prerenderizar, `usePathname()` devuelve la ruta
 * interna (/es/admin) y en el navegador la pública (/admin): normalizando, las
 * dos coinciden y no hay error de hidratación.
 */
export function stripLocalePrefix(pathname: string): string {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match || !hasLocale(match[1])) return pathname;
  return match[2] ?? "/";
}

/** Reemplaza `{clave}` en un texto del diccionario: "Mínimo {min}" → "Mínimo 8". */
export function interpolate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
