"use client";

import { useActionState } from "react";
import {
  addFavoritesToCart,
  type AddFavoritesState,
} from "@/app/[lang]/(shop)/favorites/actions";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";

/** Suma una unidad de cada favorito que todavía no esté en el carrito. */
export function AddFavoritesButton({ t }: { t: Dictionary["favorites"] }) {
  const [state, action, pending] = useActionState<AddFavoritesState>(
    addFavoritesToCart,
    {},
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 text-sm">
      <button
        type="submit"
        disabled={pending}
        className="bg-foreground text-background rounded px-3 py-1 font-medium disabled:opacity-50"
      >
        {pending ? t.adding : t.addAll}
      </button>
      {state.savedAt !== undefined && !pending && (
        <span role="status" className="opacity-80">
          {state.added
            ? interpolate(t.added, { count: state.added })
            : t.nothingNew}
        </span>
      )}
    </form>
  );
}
