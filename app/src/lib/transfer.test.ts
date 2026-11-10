import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  canUploadProof,
  isValidAlias,
  isValidCbu,
  normalizeCbu,
  transferAvailable,
  validateRejectReason,
  validateTransferSettingsForm,
} from "./transfer";

const t = es.paymentSettings.errors;
const proofT = es.transfer.errors;
// CBU with its two check digits correct.
const CBU = "0170099220000067797370";

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("isValidCbu", () => {
  it("acepta uno con sus verificadores correctos, con espacios o guiones", () => {
    expect(isValidCbu(CBU)).toBe(true);
    expect(isValidCbu("0170 0992 2000 0067 7973 70")).toBe(true);
    expect(isValidCbu("01700992-20000067797370")).toBe(true);
  });

  it("rechaza un dígito cambiado en cualquiera de los dos bloques", () => {
    expect(isValidCbu("0170099220000067797371")).toBe(false); // account
    expect(isValidCbu("0170099320000067797370")).toBe(false); // bank/branch
    expect(isValidCbu("0170099220000067797470")).toBe(false); // one digit of the account
  });

  it("rechaza largos y caracteres que no son dígitos", () => {
    expect(isValidCbu("")).toBe(false);
    expect(isValidCbu("017009922000006779737")).toBe(false);
    expect(isValidCbu("01700992200000677973700")).toBe(false);
    expect(isValidCbu("017009922000006779737A")).toBe(false);
  });
});

describe("isValidAlias", () => {
  it("de 6 a 20 caracteres entre letras, números, punto y guion", () => {
    expect(isValidAlias("distri.mascotas")).toBe(true);
    expect(isValidAlias("PAGOS-ONAKS.01")).toBe(true);
    expect(isValidAlias("corto")).toBe(false);
    expect(isValidAlias("a".repeat(21))).toBe(false);
    expect(isValidAlias("con espacio")).toBe(false);
    expect(isValidAlias("raro_guion")).toBe(false);
  });
});

describe("validateTransferSettingsForm", () => {
  const base = {
    bankName: " Banco Provincia ",
    holder: "Distribuidora Onaks SRL",
    cuit: "30-50001091-2",
  };

  it("normaliza el CUIT y el CBU y deja vacío lo que no se cargó", () => {
    expect(
      validateTransferSettingsForm(
        form({ ...base, cbu: "0170 0992 2000 0067 7973 70", alias: "" }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: {
        bankName: "Banco Provincia",
        cuit: "30500010912",
        cbu: CBU,
        alias: null,
      },
    });
    expect(
      validateTransferSettingsForm(
        form({ ...base, cbu: "", alias: "distri.mascotas" }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: { cbu: null, alias: "distri.mascotas" },
    });
  });

  it("pide al menos el CBU o el alias", () => {
    expect(
      validateTransferSettingsForm(form({ ...base, cbu: "", alias: "" }), t),
    ).toMatchObject({
      ok: false,
      state: { errors: { cbu: [t.cbuOrAlias] } },
    });
  });

  it("marca cada campo inválido y devuelve lo cargado", () => {
    const result = validateTransferSettingsForm(
      form({
        bankName: "",
        holder: "",
        cuit: "123",
        cbu: "0170099220000067797371",
        alias: "no",
      }),
      t,
    );
    expect(result).toMatchObject({
      ok: false,
      state: {
        errors: {
          bankName: [t.bankNameRequired],
          holder: [t.holderRequired],
          cuit: [t.cuitInvalid],
          cbu: [t.cbuInvalid],
          alias: [t.aliasInvalid],
        },
        values: { cuit: "123" },
      },
    });
  });
});

describe("transferAvailable", () => {
  it("solo con datos cargados que tengan CBU o alias", () => {
    expect(transferAvailable(null)).toBe(false);
    expect(transferAvailable({ cbu: null, alias: null })).toBe(false);
    expect(transferAvailable({ cbu: CBU, alias: null })).toBe(true);
    expect(transferAvailable({ cbu: null, alias: "distri.mascotas" })).toBe(
      true,
    );
  });
});

describe("canUploadProof", () => {
  const sale = {
    paymentMethod: "TRANSFER",
    state: "PENDING" as const,
    paymentState: "PENDING" as const,
  };

  it("un pedido por transferencia sin comprobante en revisión", () => {
    expect(canUploadProof(sale, [])).toBe(true);
    // A rejected or validated one does not prevent uploading another (it can be a partial payment).
    expect(
      canUploadProof(sale, [{ state: "REJECTED" }, { state: "VALIDATED" }]),
    ).toBe(true);
  });

  it("no mientras haya uno esperando revisión", () => {
    expect(canUploadProof(sale, [{ state: "PENDING" }])).toBe(false);
  });

  it("no si no es transferencia, está cancelado o ya está pagado", () => {
    expect(canUploadProof({ ...sale, paymentMethod: "CASH" }, [])).toBe(false);
    expect(canUploadProof({ ...sale, state: "CANCELED" }, [])).toBe(false);
    expect(canUploadProof({ ...sale, paymentState: "PAID" }, [])).toBe(false);
  });
});

describe("validateRejectReason", () => {
  it("es obligatorio y se recorta", () => {
    expect(validateRejectReason(form({ reason: " Borroso " }), proofT)).toEqual(
      {
        ok: true,
        reason: "Borroso",
      },
    );
    expect(validateRejectReason(form({ reason: " " }), proofT)).toEqual({
      ok: false,
      error: proofT.reasonRequired,
    });
  });

  it("máximo 200 caracteres", () => {
    expect(
      validateRejectReason(form({ reason: "x".repeat(201) }), proofT),
    ).toEqual({ ok: false, error: proofT.reasonTooLong });
  });
});

describe("normalizeCbu", () => {
  it("saca espacios y guiones", () => {
    expect(normalizeCbu(" 0170-0992 2000 ")).toBe("017009922000");
  });
});
