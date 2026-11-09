"use client";

import { useActionState } from "react";
import {
  repeatOrder,
  type OrderActionState,
} from "@/app/[lang]/(shop)/orders/actions";

/** "Repetir pedido": suma sus productos al carrito con los precios de hoy. */
export function RepeatOrderButton({
  saleId,
  label,
  pendingLabel,
}: {
  saleId: string;
  label: string;
  pendingLabel: string;
}) {
  const [state, action, pending] = useActionState<OrderActionState>(
    repeatOrder.bind(null, saleId),
    {},
  );
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-current/20 px-3 py-1 text-sm whitespace-nowrap hover:bg-current/5 disabled:opacity-50"
      >
        {pending ? pendingLabel : label}
      </button>
      {state.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
