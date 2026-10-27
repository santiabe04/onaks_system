import type { Metadata } from "next";
// Fuentes empaquetadas en node_modules: el build no depende de Google Fonts.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { INTL_LOCALE, LOCALES } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { APP_NAME } from "@/lib/app";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_NAME,
};

// Se prerenderizan los dos idiomas; el proxy elige cuál servir según APP_LOCALE.
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();

  return (
    <html
      lang={INTL_LOCALE[locale]}
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
