import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { interpolate } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteCity, deleteState } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.locations.title };
}

export default async function LocationsPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.locations.title}</h1>
        <div className="flex gap-3">
          <Link
            href="/admin/locations/states/new"
            className={buttonClass("secondary")}
          >
            {t.locations.newState}
          </Link>
          <Link href="/admin/locations/cities/new" className={buttonClass()}>
            {t.locations.newCity}
          </Link>
        </div>
      </div>
      <p className="mt-2 text-sm opacity-70">{t.locations.intro}</p>

      {/* La lista sale de la DB en cada request: va en Suspense (cacheComponents). */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <LocationsList />
      </Suspense>
    </main>
  );
}

async function LocationsList() {
  await getUserWithPermission("locations:manage");
  const t = await getT();

  const states = await db.state.findMany({
    orderBy: { name: "asc" },
    include: {
      cities: {
        orderBy: { name: "asc" },
        include: {
          _count: { select: { warehouses: true, addresses: true } },
        },
      },
    },
  });

  if (states.length === 0) {
    return <p className="mt-6 text-sm opacity-70">{t.locations.empty}</p>;
  }

  const labels = { delete: t.common.delete, deleting: t.common.deleting };

  return (
    <div className="mt-6 flex flex-col gap-6">
      {states.map((state) => (
        <section key={state.id}>
          <div className="flex items-start justify-between gap-4 border-b border-current/20 pb-2">
            <h2 className="font-medium">{state.name}</h2>
            <div className="flex shrink-0 items-start gap-4 text-sm">
              <Link
                href={`/admin/locations/cities/new?state=${state.id}`}
                className="hover:underline"
              >
                {t.locations.addCity}
              </Link>
              <Link
                href={`/admin/locations/states/${state.id}/edit`}
                className="hover:underline"
              >
                {t.common.edit}
              </Link>
              <DeleteButton
                action={deleteState.bind(null, state.id)}
                confirmMessage={interpolate(t.locations.confirmDeleteState, {
                  name: state.name,
                })}
                labels={labels}
                disabledReason={
                  state.cities.length > 0 ? t.locations.hasCities : undefined
                }
              />
            </div>
          </div>
          {state.cities.length === 0 ? (
            <p className="py-2 text-sm opacity-60">{t.locations.noCities}</p>
          ) : (
            <ul className="text-sm">
              {state.cities.map((city) => (
                <li
                  key={city.id}
                  className="flex items-start justify-between gap-4 border-b border-current/10 py-2 pl-4"
                >
                  <span>{city.name}</span>
                  <div className="flex shrink-0 items-start gap-4">
                    <Link
                      href={`/admin/locations/cities/${city.id}/edit`}
                      className="hover:underline"
                    >
                      {t.common.edit}
                    </Link>
                    <DeleteButton
                      action={deleteCity.bind(null, city.id)}
                      confirmMessage={interpolate(
                        t.locations.confirmDeleteCity,
                        { name: city.name },
                      )}
                      labels={labels}
                      disabledReason={
                        city._count.warehouses + city._count.addresses > 0
                          ? t.locations.inUse
                          : undefined
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
