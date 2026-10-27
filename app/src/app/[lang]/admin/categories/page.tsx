import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { interpolate } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { flattenCategoryTree, MAX_CATEGORY_DEPTH } from "@/lib/category";
import { db } from "@/lib/db";
import { deleteCategory } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.categories.title };
}

export default async function CategoriesPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.categories.title}</h1>
        <Link href="/admin/categories/new" className={buttonClass()}>
          {t.categories.newButton}
        </Link>
      </div>

      {/* La lista sale de la DB en cada request: va en Suspense (cacheComponents). */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <CategoryTree />
      </Suspense>
    </main>
  );
}

async function CategoryTree() {
  await getUserWithPermission("categories:manage");
  const t = await getT();

  const rows = await db.category.findMany({
    select: { id: true, name: true, parentId: true },
  });
  const nodes = flattenCategoryTree(rows);

  if (nodes.length === 0) {
    return <p className="mt-6 text-sm opacity-70">{t.categories.empty}</p>;
  }

  return (
    <ul className="mt-6 text-sm">
      {nodes.map((node) => (
        <li
          key={node.id}
          className="flex items-start justify-between gap-4 border-b border-current/10 py-2"
        >
          {/* Sangría por nivel: el árbol se lee de un vistazo. */}
          <span
            style={{ paddingLeft: `${(node.depth - 1) * 1.5}rem` }}
            className={node.depth === 1 ? "font-medium" : undefined}
          >
            {node.depth > 1 && <span className="opacity-40">└ </span>}
            {node.name}
          </span>
          <div className="flex shrink-0 items-start gap-4">
            {node.depth < MAX_CATEGORY_DEPTH && (
              <Link
                href={`/admin/categories/new?parent=${node.id}`}
                className="hover:underline"
              >
                {t.categories.addChild}
              </Link>
            )}
            <Link
              href={`/admin/categories/${node.id}/edit`}
              className="hover:underline"
            >
              {t.common.edit}
            </Link>
            <DeleteButton
              action={deleteCategory.bind(null, node.id)}
              confirmMessage={interpolate(t.categories.confirmDelete, {
                name: node.name,
              })}
              labels={{ delete: t.common.delete, deleting: t.common.deleting }}
              disabledReason={
                node.childCount > 0 ? t.categories.hasChildren : undefined
              }
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
