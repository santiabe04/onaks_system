import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { validateSupplierForm, validateSupplierProductForm } from "./supplier";

const t = es.suppliers.errors;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const valid = {
  legalName: " Alimentos Balanceados del Sur S.A. ",
  tradeName: "",
  cuit: "30-50001091-2",
  taxCondition: "REGISTERED_TAXPAYER",
  contactName: "Jorge (ventas)",
  contactMail: " Ventas@ABSur.com.ar ",
  contactPhone: "",
  address: "",
  cityId: "",
  isActive: "on",
};

describe("validateSupplierForm", () => {
  it("normaliza CUIT y mail, y guarda opcionales vacíos como null", () => {
    expect(validateSupplierForm(form(valid), t)).toMatchObject({
      ok: true,
      data: {
        legalName: "Alimentos Balanceados del Sur S.A.",
        tradeName: null,
        cuit: "30500010912",
        taxCondition: "REGISTERED_TAXPAYER",
        contactMail: "ventas@absur.com.ar",
        contactPhone: null,
        address: null,
        cityId: null,
        isActive: true,
      },
    });
  });

  it("rechaza CUIT con dígito verificador incorrecto, mail inválido y condición faltante", () => {
    const result = validateSupplierForm(
      form({
        ...valid,
        cuit: "30-50001091-3",
        contactMail: "ventas@",
        taxCondition: "",
      }),
      t,
    );
    expect(result).toMatchObject({
      ok: false,
      state: {
        errors: {
          cuit: [t.cuitInvalid],
          contactMail: [t.mailInvalid],
          taxCondition: [t.taxConditionRequired],
        },
      },
    });
  });

  it("dirección y localidad van juntas", () => {
    expect(
      validateSupplierForm(form({ ...valid, address: "Ruta 2 km 30" }), t),
    ).toMatchObject({
      ok: false,
      state: { errors: { cityId: [t.cityRequired] } },
    });
    expect(
      validateSupplierForm(form({ ...valid, cityId: "4" }), t),
    ).toMatchObject({
      ok: false,
      state: { errors: { address: [t.addressRequired] } },
    });
    expect(
      validateSupplierForm(
        form({ ...valid, address: "Ruta 2 km 30", cityId: "4" }),
        t,
      ),
    ).toMatchObject({ ok: true, data: { address: "Ruta 2 km 30", cityId: 4 } });
  });
});

describe("validateSupplierProductForm", () => {
  const product = "c4fvs2r1srhx4gwrri4k0pq0";

  it("acepta código y costo, con coma decimal", () => {
    expect(
      validateSupplierProductForm(
        form({
          productId: product,
          supplierCode: " AB-15 ",
          lastCost: "18500,50",
        }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: { productId: product, supplierCode: "AB-15", lastCost: "18500.50" },
    });
  });

  it("el costo es opcional pero, si viene, tiene que ser válido", () => {
    expect(
      validateSupplierProductForm(
        form({ productId: product, supplierCode: "", lastCost: "" }),
        t,
      ),
    ).toMatchObject({ ok: true, data: { supplierCode: null, lastCost: null } });
    expect(
      validateSupplierProductForm(
        form({ productId: product, supplierCode: "", lastCost: "-5" }),
        t,
      ),
    ).toMatchObject({
      ok: false,
      state: { errors: { lastCost: [t.costInvalid] } },
    });
  });

  it("exige el producto", () => {
    expect(
      validateSupplierProductForm(
        form({ productId: "", supplierCode: "", lastCost: "" }),
        t,
      ),
    ).toMatchObject({
      ok: false,
      state: { errors: { productId: [t.productRequired] } },
    });
  });
});
