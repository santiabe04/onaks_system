import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseCartQuantity } from "./cart";
import { NOTES_MAX_LENGTH } from "./checkout";
import { isCuid } from "./ids";

// Pure: an order entered by the admin on behalf of a customer (orders that
// come in by phone or WhatsApp). Prices from the list and cash, as in the shop.

/** How many results the product search shows. */
export const PRODUCT_SEARCH_LIMIT = 20;

type Messages = Dictionary["adminOrderNew"]["errors"];
type Numeric = { toString(): string } | string;

/** To search regardless of case or accents ("Pelota" ~ "pelota", "Alimento" ~ "alimento"). */
export function searchKey(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * The products that match what was searched: all the words have
 * to be in the name, the SKU or the barcode.
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
 * Customer, address, comment and the lines (`qty_<product>`, only of
 * products that can be sold). There must be at least one.
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
 * Product snapshot in the order: later changes do not touch it. `price`
 * is the net the customer pays; the base price stays as `unitListPrice` and
 * the last purchase cost (if any) as `unitCost`, for the margin.
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
