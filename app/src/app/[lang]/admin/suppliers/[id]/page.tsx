import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { formatCuit } from "@/lib/cuit";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import {
  deleteSupplier,
  removeSupplierProduct,
  saveSupplierProduct,
} from "../actions";
import { SupplierProductForm } from "../supplier-product-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.suppliers.title };
}

export default async function SupplierPage({
  params,
  searchParams,
}: PageProps<"/[lang]/admin/suppliers/[id]">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      {/* params y la DB son de request: va en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <SupplierDetail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SupplierDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("suppliers:manage");
  const { id } = await params;
  if (!isCuid(id)) notFound();

  const supplier = await db.supplier.findUnique({
    where: { id },
    include: {
      city: { select: { name: true } },
      products: {
        include: {
          product: { select: { name: true, sku: true, deletedAt: true } },
        },
        orderBy: { product: { name: "asc" } },
      },
    },
  });
  if (!supplier) notFound();

  const [t, locale, products] = await Promise.all([
    getT(),
    getLocale(),
    db.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true },
    }),
  ]);
  const format = formatters(locale);
  const s = t.suppliers;

  // "Editar" en una fila llega con ?product=ID: precarga sus datos en el form.
  const requested = (await searchParams).product;
  const editing = supplier.products.find((p) => p.productId === requested);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{supplier.legalName}</h1>
          <p className="text-sm opacity-70">
            {[
              supplier.tradeName,
              `CUIT ${formatCuit(supplier.cuit)}`,
              t.taxConditions[supplier.taxCondition],
              supplier.isActive ? null : s.inactive,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex items-start gap-4 text-sm">
          <Link
            href={`/admin/suppliers/${supplier.id}/account`}
            className={buttonClass("secondary")}
          >
            {t.supplierAccount.title}
          </Link>
          <Link
            href={`/admin/suppliers/${supplier.id}/edit`}
            className={buttonClass("secondary")}
          >
            {t.common.edit}
          </Link>
          <DeleteButton
            action={deleteSupplier.bind(null, supplier.id)}
            confirmMessage={interpolate(s.confirmDelete, {
              name: supplier.legalName,
            })}
            labels={{ delete: t.common.delete, deleting: t.common.deleting }}
          />
        </div>
      </div>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium">{s.contact}</dt>
          <dd className="opacity-80">
            {[supplier.contactName, supplier.contactMail, supplier.contactPhone]
              .filter(Boolean)
              .join(" · ") || "—"}
          </dd>
        </div>
        <div>
          <dt className="font-medium">{s.address}</dt>
          <dd className="opacity-80">
            {supplier.address && supplier.city
              ? `${supplier.address}, ${supplier.city.name}`
              : "—"}
          </dd>
        </div>
      </dl>

      <h2 className="mt-10 text-lg font-medium">{s.productsTitle}</h2>
      {supplier.products.length === 0 ? (
        <p className="mt-3 text-sm opacity-70">{s.productsEmpty}</p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <thead className="border-b border-current/20">
            <tr>
              <th className="py-2 pr-3 font-medium">{s.product}</th>
              <th className="py-2 pr-3 font-medium">{s.supplierCodeShort}</th>
              <th className="py-2 pr-3 text-right font-medium">
                {s.lastCostShort}
              </th>
              <th className="py-2 pr-3 font-medium">{s.lastCostAt}</th>
              <th className="py-2">
                <span className="sr-only">{t.common.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {supplier.products.map((row) => (
              <tr
                key={row.productId}
                className={`border-b border-current/10 align-top ${
                  row.product.deletedAt ? "opacity-50" : ""
                }`}
              >
                <td className="py-2 pr-3">
                  {row.product.name}
                  <span className="block font-mono text-xs opacity-70">
                    {row.product.sku}
                  </span>
                </td>
                <td className="py-2 pr-3 font-mono">
                  {row.supplierCode ?? "—"}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {row.lastCost === null ? "—" : format.money(row.lastCost)}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {row.lastCostAt ? format.date(row.lastCostAt) : "—"}
                </td>
                <td className="py-2">
                  <div className="flex items-start justify-end gap-4">
                    <Link
                      href={`/admin/suppliers/${supplier.id}?product=${row.productId}`}
                      className="hover:underline"
                    >
                      {t.common.edit}
                    </Link>
                    <DeleteButton
                      action={removeSupplierProduct.bind(
                        null,
                        supplier.id,
                        row.productId,
                      )}
                      confirmMessage={interpolate(s.confirmRemoveProduct, {
                        name: row.product.name,
                      })}
                      labels={{
                        delete: s.removeProduct,
                        deleting: t.common.deleting,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="mt-8 font-medium">{s.addProduct}</h3>
      <p className="text-xs opacity-60">{s.addProductHint}</p>
      <SupplierProductForm
        // Otra key por producto: al tocar "Editar" en otra fila se precarga de nuevo.
        key={editing?.productId ?? "new"}
        action={saveSupplierProduct.bind(null, supplier.id)}
        defaultValues={{
          productId: editing?.productId ?? "",
          supplierCode: editing?.supplierCode ?? "",
          lastCost:
            editing?.lastCost == null ? "" : format.input(editing.lastCost),
        }}
        products={products.map((p) => ({
          id: p.id,
          label: `${p.name} (${p.sku})`,
        }))}
        t={s}
        common={t.common}
      />
    </>
  );
}
