import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  validateAddressForm,
  validateCustomerForm,
  validatePersonForm,
} from "./customer";

const t = es.customers.errors;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("validateCustomerForm", () => {
  it("normaliza el CUIT y recorta textos", () => {
    expect(
      validateCustomerForm(
        form({
          tradeName: " Pet Shop Patitas ",
          legalName: "Patitas S.R.L.",
          cuit: "30-50001091-2",
          taxCondition: "SINGLE_TAX_REGIME",
        }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: {
        tradeName: "Pet Shop Patitas",
        cuit: "30500010912",
        taxCondition: "SINGLE_TAX_REGIME",
      },
    });
  });

  it("marca cada campo inválido y devuelve lo cargado", () => {
    const result = validateCustomerForm(
      form({ tradeName: "", legalName: "", cuit: "123", taxCondition: "X" }),
      t,
    );
    expect(result).toMatchObject({
      ok: false,
      state: {
        errors: {
          tradeName: [t.tradeNameRequired],
          legalName: [t.legalNameRequired],
          cuit: [t.cuitInvalid],
          taxCondition: [t.taxConditionRequired],
        },
        values: { cuit: "123" },
      },
    });
  });

  it("sin lista ni descuento: precio base", () => {
    expect(
      validateCustomerForm(
        form({
          tradeName: "Patitas",
          legalName: "Patitas SRL",
          cuit: "30-50001091-2",
          taxCondition: "REGISTERED_TAXPAYER",
        }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: { priceListId: null, discountRate: "0" },
    });
  });

  it("toma la lista y el descuento como fracción", () => {
    const priceListId = "tz4a98xxat96iws9zmbrgj3a";
    const result = validateCustomerForm(
      form({
        tradeName: "Mascotas Varela",
        legalName: "Mascotas Varela SRL",
        cuit: "30-50001091-2",
        taxCondition: "REGISTERED_TAXPAYER",
        priceListId,
        discount: "2,5",
      }),
      t,
    );
    expect(result).toMatchObject({
      ok: true,
      data: { priceListId, discountRate: "0.0250" },
    });
    expect(result.ok && "discount" in result.data).toBe(false);
  });

  it("límite de crédito y plazo de pago opcionales", () => {
    const base = {
      tradeName: "Patitas",
      legalName: "Patitas SRL",
      cuit: "30-50001091-2",
      taxCondition: "REGISTERED_TAXPAYER",
    };
    expect(validateCustomerForm(form(base), t)).toMatchObject({
      ok: true,
      data: { creditLimit: null, paymentTermDays: null },
    });
    expect(
      validateCustomerForm(
        form({ ...base, creditLimit: "500000,50", paymentTermDays: "30" }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: { creditLimit: "500000.50", paymentTermDays: 30 },
    });
    expect(
      validateCustomerForm(
        form({ ...base, creditLimit: "-1", paymentTermDays: "0" }),
        t,
      ),
    ).toMatchObject({
      ok: false,
      state: {
        errors: {
          creditLimit: [t.creditLimitInvalid],
          paymentTermDays: [t.paymentTermInvalid],
        },
      },
    });
  });

  it("rechaza un descuento de 100 % o una lista inválida", () => {
    expect(
      validateCustomerForm(
        form({ priceListId: "no es un id", discount: "100" }),
        t,
      ),
    ).toMatchObject({
      ok: false,
      state: {
        errors: {
          priceListId: [t.priceListInvalid],
          discount: [t.discountInvalid],
        },
      },
    });
  });
});

describe("validatePersonForm", () => {
  it("pasa el mail a minúsculas y deja el teléfono opcional", () => {
    expect(
      validatePersonForm(
        form({
          name: " Laura ",
          surname: "Gómez",
          mail: " Laura@Patitas.com.ar ",
          phone: "",
        }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: {
        name: "Laura",
        surname: "Gómez",
        mail: "laura@patitas.com.ar",
        phone: null,
      },
    });
  });

  it("exige nombre, apellido y un mail válido", () => {
    expect(
      validatePersonForm(
        form({ name: "", surname: "", mail: "laura@", phone: "" }),
        t,
      ),
    ).toMatchObject({
      ok: false,
      state: {
        errors: {
          name: [t.nameRequired],
          surname: [t.surnameRequired],
          mail: [t.mailInvalid],
        },
      },
    });
  });
});

describe("validateAddressForm", () => {
  it("acepta una sucursal con localidad y opcionales vacíos como null", () => {
    expect(
      validateAddressForm(
        form({
          name: "Sucursal Centro",
          address: "Av. Rivadavia 1500",
          cityId: "3",
          zipCode: "",
          description: "",
        }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: { cityId: 3, zipCode: null, description: null },
    });
  });

  it("exige nombre, dirección y localidad", () => {
    expect(
      validateAddressForm(
        form({
          name: " ",
          address: "",
          cityId: "",
          zipCode: "",
          description: "",
        }),
        t,
      ),
    ).toMatchObject({
      ok: false,
      state: {
        errors: {
          name: [t.addressNameRequired],
          address: [t.addressRequired],
          cityId: [t.cityRequired],
        },
      },
    });
  });
});
