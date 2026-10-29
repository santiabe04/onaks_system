import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  autoAllocate,
  parseAllocations,
  parseCreditNoteAmounts,
  parsePaymentHeader,
  parsePaymentLines,
  summarizeSupplierAccount,
  unallocatedOf,
} from "./supplier-account";

const t = es.supplierPayments.errors;
const OLD = "invoiceoctober";
const NEW = "invoicenovember";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parsePaymentLines", () => {
  it("lee varios medios y suma el total", () => {
    expect(
      parsePaymentLines(
        form({
          lines: "4",
          method_0: "CASH",
          amount_0: "10000",
          method_1: "TRANSFER",
          amount_1: "50000,50",
          reference_1: "OP-778812",
          method_2: "CHECK",
          amount_2: "60000",
          reference_2: "00012345",
          bank_2: "Banco Provincia",
          due_2: "2026-11-30",
          method_3: "WITHHOLDING",
          amount_3: "2100",
          reference_3: "IIBB-0001-2233",
          withholding_3: "IIBB",
        }),
        t,
      ),
    ).toEqual({
      ok: true,
      total: "122100.50",
      lines: [
        {
          method: "CASH",
          amount: "10000.00",
          reference: null,
          bank: null,
          dueDate: null,
          withholdingType: null,
        },
        {
          method: "TRANSFER",
          amount: "50000.50",
          reference: "OP-778812",
          bank: null,
          dueDate: null,
          withholdingType: null,
        },
        {
          method: "CHECK",
          amount: "60000.00",
          reference: "00012345",
          bank: "Banco Provincia",
          dueDate: "2026-11-30",
          withholdingType: null,
        },
        {
          method: "WITHHOLDING",
          amount: "2100.00",
          reference: "IIBB-0001-2233",
          bank: null,
          dueDate: null,
          withholdingType: "IIBB",
        },
      ],
    });
  });

  it("pide los datos de cada medio", () => {
    const base = { lines: "1", amount_0: "100" };
    expect(parsePaymentLines(form({ lines: "0" }), t)).toEqual({
      ok: false,
      error: t.noLines,
    });
    expect(
      parsePaymentLines(form({ ...base, method_0: "TRANSFER" }), t),
    ).toEqual({ ok: false, error: t.reference });
    expect(
      parsePaymentLines(
        form({ ...base, method_0: "CHECK", reference_0: "123" }),
        t,
      ),
    ).toEqual({ ok: false, error: t.check });
    expect(
      parsePaymentLines(
        form({ ...base, method_0: "WITHHOLDING", reference_0: "C-1" }),
        t,
      ),
    ).toEqual({ ok: false, error: t.withholding });
    expect(
      parsePaymentLines(form({ ...base, method_0: "CASH", amount_0: "0" }), t),
    ).toEqual({ ok: false, error: t.amount });
  });
});

describe("parsePaymentHeader", () => {
  it("exige la fecha de pago", () => {
    expect(parsePaymentHeader(form({ paidOn: "2026-10-29" }), t)).toEqual({
      ok: true,
      data: { paidOn: "2026-10-29", notes: null },
    });
    expect(parsePaymentHeader(form({}), t)).toEqual({
      ok: false,
      error: t.paidOn,
    });
  });
});

describe("parseAllocations", () => {
  const invoices = [
    { id: OLD, outstanding: "50000.00" },
    { id: NEW, outstanding: "80000.00" },
  ];

  it("toma lo imputado a cada factura", () => {
    expect(
      parseAllocations(
        form({ [`alloc_${OLD}`]: "50000", [`alloc_${NEW}`]: "10000,5" }),
        invoices,
        "70000",
        t,
      ),
    ).toEqual({
      ok: true,
      allocations: [
        { invoiceId: OLD, amount: "50000.00" },
        { invoiceId: NEW, amount: "10000.50" },
      ],
    });
  });

  it("no deja pasarse del saldo de la factura ni de lo disponible", () => {
    expect(
      parseAllocations(
        form({ [`alloc_${OLD}`]: "50000.01" }),
        invoices,
        "90000",
        t,
      ),
    ).toEqual({ ok: false, error: t.allocation });
    expect(
      parseAllocations(
        form({ [`alloc_${OLD}`]: "50000", [`alloc_${NEW}`]: "30000" }),
        invoices,
        "70000",
        t,
      ),
    ).toEqual({ ok: false, error: t.overAllocated });
  });
});

describe("autoAllocate", () => {
  it("cancela primero la más vieja y deja el resto en la siguiente", () => {
    expect(
      autoAllocate(
        [
          { id: OLD, outstanding: "50000" },
          { id: NEW, outstanding: "80000" },
        ],
        "70000",
      ),
    ).toEqual([
      { invoiceId: OLD, amount: "50000.00" },
      { invoiceId: NEW, amount: "20000.00" },
    ]);
  });
});

describe("summarizeSupplierAccount", () => {
  const invoices = [
    {
      id: OLD,
      state: "APPROVED" as const,
      total: "100000",
      issueDate: "2026-10-01",
      dueDate: "2026-10-20",
    },
    {
      id: NEW,
      state: "APPROVED" as const,
      total: "80000",
      issueDate: "2026-10-25",
      dueDate: "2026-11-02",
    },
    {
      id: "invoiceflagged",
      state: "FLAGGED" as const,
      total: "30000",
      issueDate: "2026-10-28",
      dueDate: null,
    },
  ];

  it("saldo, vencido, por vencer, a cuenta y observadas", () => {
    const summary = summarizeSupplierAccount(
      {
        invoices,
        payments: [
          {
            total: "70000",
            annulled: false,
            allocations: [{ invoiceId: OLD, amount: "60000" }],
          },
          {
            total: "99999",
            annulled: true,
            allocations: [{ invoiceId: NEW, amount: "80000" }],
          },
        ],
        creditNotes: [
          {
            total: "5000",
            annulled: false,
            allocations: [{ invoiceId: OLD, amount: "5000" }],
          },
        ],
      },
      "2026-10-29",
    );
    expect(summary).toEqual({
      balance: "105000.00",
      overdue: "35000.00",
      dueSoon: "80000.00",
      unallocated: "10000.00",
      flagged: "30000.00",
      invoices: [
        {
          id: OLD,
          paid: "65000.00",
          outstanding: "35000.00",
          dueOn: "2026-10-20",
          overdue: true,
        },
        {
          id: NEW,
          paid: "0.00",
          outstanding: "80000.00",
          dueOn: "2026-11-02",
          overdue: false,
        },
      ],
    });
  });
});

describe("unallocatedOf", () => {
  it("es el total menos lo imputado; anulado, nada", () => {
    expect(
      unallocatedOf({
        total: "70000",
        annulled: false,
        allocations: [{ invoiceId: OLD, amount: "60000" }],
      }),
    ).toBe("10000.00");
    expect(
      unallocatedOf({ total: "70000", annulled: true, allocations: [] }),
    ).toBe("0.00");
  });
});

describe("parseCreditNoteAmounts", () => {
  const nc = es.creditNotes.errors;
  it("el total es neto + IVA y no puede ser 0", () => {
    expect(
      parseCreditNoteAmounts(form({ subTotal: "18500", tax: "1942,50" }), nc),
    ).toEqual({
      ok: true,
      data: {
        subTotal: "18500.00",
        tax: "1942.50",
        total: "20442.50",
        notes: null,
      },
    });
    expect(parseCreditNoteAmounts(form({ subTotal: "0" }), nc)).toEqual({
      ok: false,
      error: nc.amount,
    });
  });
});
