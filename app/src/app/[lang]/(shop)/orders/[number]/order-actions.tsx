"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { STATE_COMMENT_MAX_LENGTH } from "@/lib/sale-state-form";
import {
  cancelOwnOrder,
  discardOrderEdit,
  startOrderEdit,
  type OrderActionState,
} from "../actions";

/** Cancelar y modificar un pedido Pendiente, desde "Mis pedidos". */
export function OrderActions({
  saleId,
  canEdit,
  editingByMe,
  t,
}: {
  saleId: string;
  /** El admin habilitó la modificación. */
  canEdit: boolean;
  /** Esta persona ya lo está modificando. */
  editingByMe: boolean;
  t: Dictionary["orders"];
}) {
  const [cancelState, cancel, canceling] = useActionState<
    OrderActionState,
    FormData
  >(cancelOwnOrder.bind(null, saleId), {});
  const [editState, edit, starting] = useActionState<OrderActionState>(
    startOrderEdit.bind(null, saleId),
    {},
  );
  const [discardState, discard, discarding] = useActionState<OrderActionState>(
    discardOrderEdit.bind(null, saleId),
    {},
  );

  return (
    <section className="mt-6 flex flex-col gap-4 rounded border border-current/20 p-4 text-sm">
      {editingByMe ? (
        <div className="flex flex-col gap-2">
          <p>{t.editing}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/cart" className={buttonClass()}>
              {t.goToCart}
            </Link>
            <form action={discard}>
              <button
                type="submit"
                disabled={discarding}
                className={buttonClass("secondary")}
              >
                {t.discard}
              </button>
            </form>
          </div>
          <FormError messages={discardState.error} />
        </div>
      ) : (
        canEdit && (
          <form action={edit} className="flex flex-col gap-2">
            <p className="opacity-70">{t.editHint}</p>
            <div>
              <button
                type="submit"
                disabled={starting}
                className={buttonClass()}
              >
                {t.edit}
              </button>
            </div>
            <FormError messages={editState.error} />
          </form>
        )
      )}

      <details>
        <summary className="cursor-pointer font-medium text-red-600">
          {t.cancel}
        </summary>
        <form action={cancel} className="mt-2 flex flex-col gap-2">
          <p className="opacity-70">{t.cancelHint}</p>
          <input
            name="comment"
            maxLength={STATE_COMMENT_MAX_LENGTH}
            placeholder={t.cancelReason}
            aria-label={t.cancelReason}
            className="rounded border border-current/20 bg-transparent px-3 py-2"
          />
          <FormError messages={cancelState.error} />
          <div>
            <button
              type="submit"
              disabled={canceling}
              className="text-red-600 hover:underline disabled:opacity-50"
            >
              {canceling ? t.canceling : t.cancelConfirm}
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}
