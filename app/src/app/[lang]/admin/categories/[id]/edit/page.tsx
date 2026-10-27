import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { parentOptions, parseCategoryId } from "@/lib/category";
import { db } from "@/lib/db";
import { updateCategory } from "../../actions";
import { CategoryForm } from "../../category-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.categories.editTitle };
}

export default async function EditCategoryPage({
  params,
}: PageProps<"/[lang]/admin/categories/[id]/edit">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-md p-8">
      <h1 className="text-2xl font-semibold">{t.categories.editTitle}</h1>
      {/* params y la query a la DB son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <EditForm params={params} />
      </Suspense>
    </main>
  );
}

async function EditForm({ params }: { params: Promise<{ id: string }> }) {
  await getUserWithPermission("categories:manage");
  const t = await getT();

  const categoryId = parseCategoryId((await params).id);
  if (categoryId === null) notFound();

  const rows = await db.category.findMany({
    select: { id: true, name: true, parentId: true },
  });
  const category = rows.find((row) => row.id === categoryId);
  if (!category) notFound();

  return (
    <CategoryForm
      action={updateCategory.bind(null, category.id)}
      defaultValues={{
        name: category.name,
        parentId: category.parentId === null ? "" : String(category.parentId),
      }}
      parents={parentOptions(rows, category.id).map((p) => ({
        id: p.id,
        label: p.path.join(" › "),
      }))}
      submitLabel={t.common.save}
      t={t.categories}
      common={t.common}
    />
  );
}
