import { lang } from "next/root-params";
import { notFound } from "next/navigation";
import { hasLocale, type Locale } from "./config";
import { getDictionary, type Dictionary } from "./dictionary";

// Para Server Components: el idioma sale del segmento `[lang]` que agrega el
// proxy, así cada idioma se prerenderiza por separado en el build.

export async function getLocale(): Promise<Locale> {
  const value = await lang();
  if (!hasLocale(value)) notFound();
  return value;
}

export async function getT(): Promise<Dictionary> {
  return getDictionary(await getLocale());
}
