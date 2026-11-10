import type { Metadata } from "next";
// Fonts bundled in node_modules: the build does not depend on Google Fonts.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { INTL_LOCALE, LOCALES } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { APP_NAME } from "@/lib/app";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_NAME,
};

// Both languages are prerendered; the proxy chooses which one to serve based on APP_LOCALE.
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();

  return (
    // suppressHydrationWarning: the theme script changes `data-theme` before hydration.
    <html
      lang={INTL_LOCALE[locale]}
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
