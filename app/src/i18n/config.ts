// Without `server-only`: used by the proxy, Server Actions and Client Components.

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

/** BCP 47 tag for `Intl` and `<html lang>`. */
export const INTL_LOCALE: Record<Locale, string> = {
  es: "es-AR",
  en: "en-US",
};

export function hasLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Installation language (`APP_LOCALE`), read at runtime: the same image
 * serves both. An invalid value throws instead of falling back to the default,
 * so the configuration error is noticed.
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

/** Public route → internal route under `app/[lang]` ("/login" → "/es/login"). */
export function localizePath(pathname: string, locale: Locale): string {
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

/**
 * Inverse of `localizePath`. When prerendering, `usePathname()` returns the internal route
 * (/es/admin) and in the browser the public one (/admin): normalizing, the
 * two match and there is no hydration error.
 */
export function stripLocalePrefix(pathname: string): string {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match || !hasLocale(match[1])) return pathname;
  return match[2] ?? "/";
}

/** Replaces `{key}` in a dictionary text: "Minimum {min}" → "Minimum 8". */
export function interpolate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
