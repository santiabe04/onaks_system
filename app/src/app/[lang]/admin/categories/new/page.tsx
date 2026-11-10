import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { parentOptions, parseCategoryId } from "@/lib/category";
import { getCategoryTreeData } from "@/lib/category-queries";
import { createCategory } from "../actions";
import { CategoryForm } from "../category-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.categories.newTitle };
}

export default async function NewCategoryPage({
  searchParams,
}: PageProps<"/[lang]/admin/categories/new">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-md p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.categories.newTitle}</h1>
      {/* The parent options come from the DB and `?parent=` from the URL. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <NewForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function NewForm({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("categories:manage");
  const t = await getT();

  const { rows, withProducts } = await getCategoryTreeData();
  const parents = parentOptions(rows, null, withProducts);

  // "Add subcategory" arrives with ?parent=ID: it is preselected if valid.
  const requested = parseCategoryId((await searchParams).parent);
  const parentId = parents.some((p) => p.id === requested)
    ? String(requested)
    : "";

  return (
    <CategoryForm
      action={createCategory}
      defaultValues={{ name: "", parentId }}
      parents={parents.map((p) => ({ id: p.id, label: p.path.join(" › ") }))}
      submitLabel={t.common.create}
      t={t.categories}
      common={t.common}
    />
  );
}
