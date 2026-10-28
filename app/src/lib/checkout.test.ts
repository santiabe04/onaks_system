import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { cartFingerprint } from "./cart-fingerprint";
import { parseSaleNumber, validateCheckoutForm } from "./checkout";

const t = es.checkout.errors;

// Carrito de un pet shop: bolsas de alimento por unidad y alimento suelto por kg.
const lines = [
  {
    productId: "prodbolsa15",
    quantity: "2",
    price: "25000.00",
    rate: "0.1050",
  },
  { productId: "prodsuelto", quantity: "1.25", price: "4000.99", rate: "0.21" },
];

const FINGERPRINT = cartFingerprint(lines);

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("cartFingerprint", () => {
  it("no depende del orden ni de cómo vienen escritos los números", () => {
    expect(
      cartFingerprint([
        {
          productId: "prodsuelto",
          quantity: "1.250",
          price: "4000.99",
          rate: "0.2100",
        },
        {
          productId: "prodbolsa15",
          quantity: "2.000",
          price: "25000",
          rate: "0.105",
        },
      ]),
    ).toBe(FINGERPRINT);
  });

  it("cambia si cambia un precio, una alícuota o una cantidad", () => {
    const changed = (patch: Partial<(typeof lines)[number]>) =>
      cartFingerprint([{ ...lines[0], ...patch }, lines[1]]);
    expect(changed({ price: "25000.01" })).not.toBe(FINGERPRINT);
    expect(changed({ rate: "0.1051" })).not.toBe(FINGERPRINT);
    expect(changed({ quantity: "3" })).not.toBe(FINGERPRINT);
  });

  it("cambia si se agrega o se saca un producto", () => {
    expect(cartFingerprint([lines[0]])).not.toBe(FINGERPRINT);
  });
});

describe("validateCheckoutForm", () => {
  it("acepta dirección y comentario, y guarda el comentario vacío como null", () => {
    expect(
      validateCheckoutForm(
        form({
          addressId: "addrdeposito",
          notes: "  ",
          fingerprint: FINGERPRINT,
        }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: {
        addressId: "addrdeposito",
        notes: null,
        fingerprint: FINGERPRINT,
      },
    });
  });

  it("exige la dirección y devuelve lo elegido", () => {
    const result = validateCheckoutForm(
      form({
        addressId: "",
        notes: "Entregar a la mañana",
        fingerprint: FINGERPRINT,
      }),
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors?.addressId).toEqual([t.addressRequired]);
    expect(result.state.values).toEqual({
      addressId: "",
      notes: "Entregar a la mañana",
    });
  });

  it("limita el largo del comentario", () => {
    const result = validateCheckoutForm(
      form({
        addressId: "addrdeposito",
        notes: "a".repeat(501),
        fingerprint: FINGERPRINT,
      }),
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors?.notes).toEqual(["Máximo 500 caracteres"]);
  });

  it("sin huella válida pide revisar el carrito", () => {
    const result = validateCheckoutForm(
      form({ addressId: "addrdeposito", notes: "", fingerprint: "x" }),
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors?.form).toEqual([t.cartChanged]);
  });
});

describe("parseSaleNumber", () => {
  it("acepta números de pedido positivos", () => {
    expect(parseSaleNumber("12")).toBe(12);
  });

  it("rechaza lo que no es un número de pedido", () => {
    expect(parseSaleNumber("0")).toBeNull();
    expect(parseSaleNumber("1.5")).toBeNull();
    expect(parseSaleNumber("abc")).toBeNull();
    expect(parseSaleNumber("99999999999")).toBeNull();
  });
});
