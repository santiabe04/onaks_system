"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  removeCartItem,
  updateCartItem,
  type CartActionState,
} from "./actions";

/** Cantidad editable y "Quitar" de una línea del carrito. */
export function CartLineControls({
  productId,
  quantity,
  allowsDecimals,
  unitName,
  t,
}: {
  productId: string;
  /** Con el separador decimal del idioma ("1,5"). */
  quantity: string;
  allowsDecimals: boolean;
  unitName: string;
  t: Dictionary["cart"];
}) {
  const [state, update, updating] = useActionState<CartActionState, FormData>(
    updateCartItem.bind(null, productId),
    {},
  );
  const [, remove, removing] = useActionState<CartActionState>(
    removeCartItem.bind(null, productId),
    {},
  );

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <form action={update} className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            <span className="sr-only">{t.quantity}</span>
            <input
              key={quantity}
              name="quantity"
              type="text"
              inputMode={allowsDecimals ? "decimal" : "numeric"}
              defaultValue={quantity}
              required
              className="w-20 rounded border border-current/20 bg-transparent px-2 py-1"
            />
            <span className="text-xs opacity-70">{unitName}</span>
          </label>
          <button
            type="submit"
            disabled={updating}
            className="text-sm hover:underline disabled:opacity-50"
          >
            {t.update}
          </button>
        </form>
        <form action={remove}>
          <button
            type="submit"
            disabled={removing}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            {t.remove}
          </button>
        </form>
      </div>
      {state.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
    </div>
  );
}

/** Solo "Quitar", para productos que ya no se venden. */
export function RemoveCartLine({
  productId,
  t,
}: {
  productId: string;
  t: Dictionary["cart"];
}) {
  const [, remove, removing] = useActionState<CartActionState>(
    removeCartItem.bind(null, productId),
    {},
  );
  return (
    <form action={remove}>
      <button
        type="submit"
        disabled={removing}
        className="text-sm text-red-600 hover:underline disabled:opacity-50"
      >
        {t.remove}
      </button>
    </form>
  );
}
