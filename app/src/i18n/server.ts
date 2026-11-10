import { lang } from "next/root-params";
import { notFound } from "next/navigation";
import { hasLocale, type Locale } from "./config";
import { getDictionary, type Dictionary } from "./dictionary";

// For Server Components: the language comes from the `[lang]` segment added by the
// proxy, so each language is prerendered separately at build time.

export async function getLocale(): Promise<Locale> {
  const value = await lang();
  if (!hasLocale(value)) notFound();
  return value;
}

export async function getT(): Promise<Dictionary> {
  return getDictionary(await getLocale());
}
