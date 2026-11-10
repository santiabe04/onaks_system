"use client";

import { useActionState } from "react";
import {
  addToCart,
  type CartActionState,
} from "@/app/[lang]/(shop)/cart/actions";
import type { Dictionary } from "@/i18n/dictionaries/es";

type Props = {
  productId: string;
  unitName: string;
  allowsDecimals: boolean;
  t: Dictionary["cart"];
  /** More compact for the catalog cards. */
  compact?: boolean;
};

/** Quantity + "Add". With whole units ("u") the input does not accept decimals. */
export function AddToCart({
  productId,
  unitName,
  allowsDecimals,
  t,
  compact,
}: Props) {
  const [state, action, pending] = useActionState<CartActionState, FormData>(
    addToCart.bind(null, productId),
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-1">
      {/* On narrow cards the button drops to its own line and takes the full width. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-sm">
          <span className="sr-only">{t.quantity}</span>
          <input
            // key: after adding, it goes back to 1.
            key={state.savedAt ?? 0}
            name="quantity"
            type="number"
            inputMode={allowsDecimals ? "decimal" : "numeric"}
            min={allowsDecimals ? 0.001 : 1}
            step={allowsDecimals ? 0.001 : 1}
            defaultValue={1}
            required
            className={`rounded border border-current/20 bg-transparent px-2 py-1 ${
              compact ? "w-16" : "w-24"
            }`}
          />
          <span className="text-xs opacity-70">{unitName}</span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className={`bg-foreground text-background rounded px-3 py-1 text-sm font-medium disabled:opacity-50 ${
            compact ? "grow" : ""
          }`}
        >
          {pending ? t.adding : t.add}
        </button>
      </div>
      {state.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : (
        state.savedAt && (
          <span
            role="status"
            className="text-xs text-green-700 dark:text-green-400"
          >
            ✓ {t.added}
          </span>
        )
      )}
    </form>
  );
}
