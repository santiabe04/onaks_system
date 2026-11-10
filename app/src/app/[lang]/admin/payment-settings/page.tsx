import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { formatCuit } from "@/lib/cuit";
import { db } from "@/lib/db";
import { PaymentSettingsForm } from "./payment-settings-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.paymentSettings.title };
}

export default async function PaymentSettingsPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.paymentSettings.title}</h1>
      <p className="mt-1 text-sm opacity-70">{t.paymentSettings.hint}</p>
      {/* The data comes from the DB on every request: it goes in Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Settings />
      </Suspense>
    </main>
  );
}

async function Settings() {
  await getUserWithPermission("payment-settings:manage");
  const [t, settings] = await Promise.all([
    getT(),
    db.transferSettings.findUnique({ where: { id: 1 } }),
  ]);

  return (
    <>
      {!settings && (
        <p
          role="status"
          className="mt-4 rounded border border-current/20 bg-current/5 p-3 text-sm"
        >
          {t.paymentSettings.notConfigured}
        </p>
      )}
      <PaymentSettingsForm
        defaultValues={{
          bankName: settings?.bankName ?? "",
          holder: settings?.holder ?? "",
          cuit: settings ? formatCuit(settings.cuit) : "",
          cbu: settings?.cbu ?? "",
          alias: settings?.alias ?? "",
        }}
        t={t.paymentSettings}
        common={t.common}
      />
    </>
  );
}
