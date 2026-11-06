import type { ReactNode } from "react";
import type { CustomerCreditNoteKind } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { formatters } from "@/i18n/format";

type Numeric = { toString(): string };

export type CreditNoteRow = {
  id: string;
  number: number;
  kind: CustomerCreditNoteKind;
  amount: Numeric;
  reason: string;
  createdAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  items: {
    productId: string;
    quantity: Numeric;
    destination: "RESTOCK" | "WRITE_OFF";
    product: { name: string; measurementUnit: { name: string } };
  }[];
};

/**
 * Las notas de crédito de un pedido. Con `internal` (admin) se ve el motivo,
 * qué se hizo con cada producto y las anuladas; sin él (cliente) solo lo que
 * lo afecta: número, fecha, productos e importe de las vigentes.
 * `actions` es lo que se agrega al pie de cada nota (el botón de anular).
 */
export function CreditNoteList({
  notes,
  internal,
  format,
  t,
  actions,
}: {
  notes: CreditNoteRow[];
  internal: boolean;
  format: ReturnType<typeof formatters>;
  t: Dictionary["customerCreditNotes"];
  actions?: (note: CreditNoteRow) => ReactNode;
}) {
  const shown = internal ? notes : notes.filter((note) => !note.voidedAt);
  return (
    <ul className="mt-2 flex flex-col gap-3 text-sm">
      {shown.map((note) => (
        <li
          key={note.id}
          className={`rounded border border-current/10 p-3 ${note.voidedAt ? "opacity-60" : ""}`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium whitespace-nowrap">
              {interpolate(t.short, { number: note.number })} ·{" "}
              {t.kinds[note.kind]}
            </span>
            <span className="whitespace-nowrap">
              −{format.money(note.amount)}
            </span>
          </div>
          <p className="text-xs opacity-70">
            {format.date(note.createdAt)}
            {internal && ` · ${note.reason}`}
          </p>
          {note.items.length > 0 && (
            <ul className="mt-1 text-xs">
              {note.items.map((item) => (
                <li key={item.productId}>
                  {format.number(item.quantity)}{" "}
                  {item.product.measurementUnit.name} · {item.product.name}
                  {internal && ` · ${t.destinations[item.destination]}`}
                </li>
              ))}
            </ul>
          )}
          {note.voidedAt && (
            <p className="mt-1 text-xs line-through">
              {interpolate(t.voided, { reason: note.voidReason ?? "" })}
            </p>
          )}
          {actions?.(note)}
        </li>
      ))}
    </ul>
  );
}
