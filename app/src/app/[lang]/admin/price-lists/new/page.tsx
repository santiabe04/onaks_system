import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { createPriceList } from "../actions";
import { PriceListForm } from "../price-list-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.priceLists.newTitle };
}

export default async function NewPriceListPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-md p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.priceLists.newTitle}</h1>
      <PriceListForm
        action={createPriceList}
        defaultValues={{ name: "", adjustment: "0" }}
        submitLabel={t.common.create}
        t={t.priceLists}
        common={t.common}
      />
    </main>
  );
}
