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
 * Para Server Actions y Route Handlers, donde `next/root-params` no funciona.
 * Coincide con el de la página porque el proxy reescribe con el mismo `APP_LOCALE`.
 */
export function getActionDictionary(): Dictionary {
  return getDictionary(appLocale());
}
