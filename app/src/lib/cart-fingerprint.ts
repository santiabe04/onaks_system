import { createHash } from "node:crypto";
import { toMilli } from "./quantity";

// Solo server: usa node:crypto. Va aparte de lib/checkout, que también lo
// importa el formulario del cliente.

type Numeric = { toString(): string } | string;

/** "25000" o un Decimal("25000.00") → "2500000" (con `digits` decimales fijos). */
function scaled(value: Numeric, digits: number): string {
  const [integer, decimals = ""] = value.toString().trim().split(".");
  return BigInt(
    integer + decimals.padEnd(digits, "0").slice(0, digits),
  ).toString();
}

export type FingerprintLine = {
  productId: string;
  quantity: Numeric;
  price: Numeric;
  rate: Numeric;
};

/**
 * Huella de lo que el cliente vio al confirmar: productos, cantidades, precios
 * y alícuotas. Si cambia algo entre que se mostró y se confirmó (otro precio,
 * otra pestaña que editó el carrito), la confirmación se rechaza.
 */
export function cartFingerprint(lines: FingerprintLine[]): string {
  const canonical = lines
    .map((line) =>
      [
        line.productId,
        toMilli(line.quantity).toString(),
        // Normalizados: "25000" y "25000.00" son el mismo precio.
        scaled(line.price, 2),
        scaled(line.rate, 4),
      ].join(":"),
    )
    .sort()
    .join("|");
  return createHash("sha256").update(canonical).digest("hex");
}
