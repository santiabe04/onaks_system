import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseCartQuantity } from "./cart";
import { NOTES_MAX_LENGTH } from "./checkout";
import { isCuid } from "./ids";

// Puro: pedido cargado por el admin en nombre de un cliente (pedidos que
// llegan por teléfono o WhatsApp). Precios de lista y efectivo, como la tienda.

/** Hasta cuántos resultados muestra el buscador de productos. */
export const PRODUCT_SEARCH_LIMIT = 20;

type Messages = Dictionary["adminOrderNew"]["errors"];
type Numeric = { toString(): string } | string;

/** Para buscar sin importar mayúsculas ni acentos ("Pelota" ~ "pelota", "Alimento" ~ "alimento"). */
export function searchKey(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Los productos que coinciden con lo que se buscó: todas las palabras tienen
 * que estar en el nombre, el SKU o el código de barras.
 */
export function searchProducts<
  T extends { name: string; sku: string; barcode: string | null },
>(products: T[], query: string, limit = PRODUCT_SEARCH_LIMIT): T[] {
  const words = searchKey(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return products
    .filter((product) => {
      const haystack = searchKey(
        `${product.name} ${product.sku} ${product.barcode ?? ""}`,
      );
      return words.every((word) => haystack.includes(word));
    })
    .slice(0, limit);
}

export type AdminOrderInput = {
  customerId: string;
  addressId: string;
  notes: string | null;
  lines: { productId: string; quantity: string }[];
};

/**
 * Cliente, dirección, comentario y las líneas (`qty_<producto>`, solo de
 * productos que se pueden vender). Tiene que haber al menos una.
 */
export function parseAdminOrder(
  formData: FormData,
  products: { id: string; allowsDecimals: boolean }[],
  t: Messages,
): { ok: true; data: AdminOrderInput } | { ok: false; error: string } {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const customerId = read("customerId");
  if (!isCuid(customerId)) return { ok: false, error: t.customer };
  const addressId = read("addressId");
  if (!isCuid(addressId)) return { ok: false, error: t.address };
  const notes = read("notes");
  if (notes.length > NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: interpolate(t.notesTooLong, { max: NOTES_MAX_LENGTH }),
    };
  }

  const lines: AdminOrderInput["lines"] = [];
  for (const key of formData.keys()) {
    if (!key.startsWith("qty_")) continue;
    const productId = key.slice(4);
    const product = products.find((row) => row.id === productId);
    if (!product) return { ok: false, error: t.unavailable };
    const quantity = parseCartQuantity(read(key), product.allowsDecimals);
    if (quantity === null) return { ok: false, error: t.quantity };
    lines.push({ productId, quantity });
  }
  if (lines.length === 0) return { ok: false, error: t.noLines };
  return {
    ok: true,
    data: { customerId, addressId, notes: notes || null, lines },
  };
}

/**
 * Foto del producto en el pedido: los cambios posteriores no lo tocan. `price`
 * es el neto que paga el cliente; el precio base queda como `unitListPrice` y
 * el último costo de compra (si hay) como `unitCost`, para el margen.
 */
export function saleItemSnapshot(
  product: {
    id: string;
    price: Numeric;
    weight: Numeric;
    volume: Numeric | null;
    taxRate: { rate: Numeric };
  },
  quantity: Numeric,
  price: Numeric,
  cost: Numeric | undefined,
) {
  return {
    productId: product.id,
    quantity: quantity.toString(),
    unitPrice: price.toString(),
    unitListPrice: product.price.toString(),
    unitWeight: product.weight.toString(),
    unitVolume: product.volume?.toString() ?? null,
    unitTaxRate: product.taxRate.rate.toString(),
    unitCost: cost?.toString() ?? null,
  };
}
