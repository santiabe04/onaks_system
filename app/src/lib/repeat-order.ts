import { fromMilli, toMilli } from "./quantity";

// Pure: what gets added to the cart when repeating an order. Prices are not copied:
// the cart always uses today's (the customer's list and discount).

type Numeric = { toString(): string } | string;

const SCALE = BigInt(1000);
const ZERO = BigInt(0);

export type RepeatLine = {
  productId: string;
  /** What was ordered (`sale_items.quantity`, up to 4 decimals). */
  quantity: Numeric;
  /** Whether the product can be bought today (active and not deleted). */
  available: boolean;
  /** Whether its unit allows fractions today (it may have changed). */
  allowsDecimals: boolean;
};

export type RepeatPlan = {
  adds: { productId: string; quantity: string }[];
  /** Products that can no longer be bought and are not added. */
  omitted: number;
};

/**
 * Quantity for the cart: to thousandths (the cart stores 3 decimals) and, if
 * the unit no longer allows fractions, rounded up: at least what was
 * ordered. null if there is nothing left to add.
 */
export function repeatQuantity(
  quantity: Numeric,
  allowsDecimals: boolean,
): string | null {
  let milli = toMilli(quantity);
  if (milli <= ZERO) return null;
  if (!allowsDecimals && milli % SCALE !== ZERO) {
    milli = ((milli + SCALE - BigInt(1)) / SCALE) * SCALE;
  }
  return fromMilli(milli);
}

/** What to add to the cart and how many products are left out. */
export function planRepeat(lines: RepeatLine[]): RepeatPlan {
  const adds: RepeatPlan["adds"] = [];
  let omitted = 0;
  for (const line of lines) {
    const quantity = line.available
      ? repeatQuantity(line.quantity, line.allowsDecimals)
      : null;
    if (quantity === null) omitted += 1;
    else adds.push({ productId: line.productId, quantity });
  }
  return { adds, omitted };
}
