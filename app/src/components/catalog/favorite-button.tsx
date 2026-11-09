"use client";

import { useOptimistic, useTransition } from "react";
import { setFavorite } from "@/app/[lang]/(shop)/favorites/actions";
import type { Dictionary } from "@/i18n/dictionaries/es";

/**
 * Corazón de favorito: cambia al instante y se guarda en segundo plano. Si
 * falla, vuelve a lo que decía el server.
 */
export function FavoriteButton({
  productId,
  favorite,
  t,
}: {
  productId: string;
  favorite: boolean;
  t: Dictionary["favorites"];
}) {
  const [optimistic, setOptimistic] = useOptimistic(favorite);
  const [pending, startTransition] = useTransition();
  const label = optimistic ? t.remove : t.add;

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await setFavorite(productId, !optimistic);
        })
      }
      className={`rounded border border-current/20 px-2 py-1 text-lg leading-none ${
        optimistic ? "text-red-600" : "opacity-70 hover:opacity-100"
      }`}
    >
      <span aria-hidden="true">{optimistic ? "♥" : "♡"}</span>
    </button>
  );
}
