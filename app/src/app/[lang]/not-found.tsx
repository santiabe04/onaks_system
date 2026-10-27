import Link from "next/link";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">{t.notFound.title}</h1>
        <p className="mt-2 text-sm opacity-70">{t.notFound.description}</p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          {t.notFound.back}
        </Link>
      </div>
    </main>
  );
}
