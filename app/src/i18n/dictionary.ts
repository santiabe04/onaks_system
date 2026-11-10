import "server-only";
import { appLocale, type Locale } from "./config";
import { en } from "./dictionaries/en";
import { es, type Dictionary } from "./dictionaries/es";

export type { Dictionary };

const DICTIONARIES: Record<Locale, Dictionary> = { es, en };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/**
 * For Server Actions and Route Handlers, where `next/root-params` does not work.
 * It matches the page's because the proxy rewrites with the same `APP_LOCALE`.
 */
export function getActionDictionary(): Dictionary {
  return getDictionary(appLocale());
}
