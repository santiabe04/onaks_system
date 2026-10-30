"use client";

import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { CatalogItem } from "@/lib/catalog-queries";
import { AddToCart } from "./add-to-cart";

type View = "cards" | "list";

// Preferencia por navegador, como el tema.
const STORAGE_KEY = "onaks-catalog-view";
const CHANGE_EVENT = "onaks-catalog-view-change";

function readView(): View {
  try {
    return localStorage.getItem(STORAGE_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function saveView(view: View) {
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Sin localStorage la elección vale hasta recargar.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Selector tarjetas / lista. */
export function ViewToggle({ t }: { t: Dictionary["catalog"] }) {
  // En el server no hay preferencia: se renderiza "cards" y se corrige al hidratar.
  const view = useSyncExternalStore(subscribe, readView, () => "cards");
  return (
    <div
      role="radiogroup"
      aria-label={t.view}
      className="inline-flex rounded border border-current/20 p-0.5 text-xs"
    >
      {(["cards", "list"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={view === option}
          onClick={() => saveView(option)}
          className={`rounded px-2 py-1 ${
            view === option
              ? "bg-foreground text-background"
              : "opacity-70 hover:opacity-100"
          }`}
        >
          {option === "cards" ? t.viewCards : t.viewList}
        </button>
      ))}
    </div>
  );
}

/** Los productos de la página, en tarjetas o en lista según la preferencia. */
export function CatalogView({
  items,
  canBuy,
  t,
  cart,
}: {
  items: CatalogItem[];
  /** Solo los clientes compran: el admin ve el catálogo sin "Agregar". */
  canBuy: boolean;
  t: Dictionary["catalog"];
  cart: Dictionary["cart"];
}) {
  const view = useSyncExternalStore(subscribe, readView, () => "cards");
  // El form queda fuera del link: un form dentro de un <a> no es HTML válido.
  const add = (item: CatalogItem, compact?: boolean) =>
    canBuy && (
      <AddToCart
        productId={item.id}
        unitName={item.unitName}
        allowsDecimals={item.allowsDecimals}
        t={cart}
        compact={compact}
      />
    );

  if (view === "list") {
    return (
      <ul className="divide-y divide-current/10">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 py-3">
            <Link
              href={`/products/${item.id}`}
              className="flex items-center gap-4 hover:bg-current/5"
            >
              <Thumb item={item} size={56} t={t} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.name}</p>
                <p className="text-xs opacity-70">
                  {item.sku} · {item.unitLine}
                </p>
              </div>
              {/* El neto puede partirse en dos renglones: en celular deja lugar al nombre. */}
              <div className="max-w-[45%] shrink-0 text-right">
                {item.baseFinalPrice && (
                  <p className="text-xs whitespace-nowrap line-through opacity-60">
                    {item.baseFinalPrice}
                  </p>
                )}
                <p className="font-semibold whitespace-nowrap">
                  {item.finalPrice}
                </p>
                <p className="text-xs opacity-70">{item.netLine}</p>
              </div>
            </Link>
            {canBuy && <div className="self-end">{add(item)}</div>}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex h-full flex-col overflow-hidden rounded border border-current/20"
        >
          <Link
            href={`/products/${item.id}`}
            className="flex flex-1 flex-col hover:bg-current/5"
          >
            <Thumb item={item} t={t} />
            <div className="flex flex-1 flex-col gap-1 p-3">
              <p className="text-sm font-medium">{item.name}</p>
              <p className="text-xs opacity-60">{item.sku}</p>
              {item.description && (
                <p className="line-clamp-2 text-xs opacity-80">
                  {item.description}
                </p>
              )}
              <p className="text-xs opacity-70">{item.unitLine}</p>
              <div className="mt-auto pt-2">
                {item.baseFinalPrice && (
                  <p className="text-xs line-through opacity-60">
                    {item.baseFinalPrice}
                  </p>
                )}
                <p className="text-lg font-semibold">{item.finalPrice}</p>
                <p className="text-xs opacity-70">{item.netLine}</p>
              </div>
            </div>
          </Link>
          {canBuy && <div className="px-3 pb-3">{add(item, true)}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Foto del producto; sin foto, un recuadro. `size` fija la miniatura de la lista. */
function Thumb({
  item,
  size,
  t,
}: {
  item: CatalogItem;
  size?: number;
  t: Dictionary["catalog"];
}) {
  const box = size
    ? { width: size, height: size }
    : { width: undefined, height: undefined };
  const className = size
    ? "shrink-0 rounded border border-current/20 object-cover"
    : "aspect-square w-full object-cover";
  if (!item.imageUrl) {
    return (
      <div
        style={box}
        className={`${className} flex items-center justify-center bg-current/5 text-xs opacity-50`}
      >
        {t.noImage}
      </div>
    );
  }
  return (
    <Image
      src={item.imageUrl}
      alt={item.name}
      width={size ?? 400}
      height={size ?? 400}
      unoptimized
      className={className}
      style={size ? box : undefined}
    />
  );
}
