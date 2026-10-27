"use client";

import { useActionState } from "react";
import type { DeleteMeasurementUnitState } from "@/lib/measurement-unit";

type Props = {
  action: (
    state: DeleteMeasurementUnitState,
  ) => Promise<DeleteMeasurementUnitState>;
  confirmMessage: string;
  labels: { delete: string; deleting: string };
  disabledReason?: string;
};

export function DeleteMeasurementUnitButton({
  action,
  confirmMessage,
  labels,
  disabledReason,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!confirm(confirmMessage)) event.preventDefault();
      }}
      className="inline-flex flex-col items-end"
    >
      <button
        type="submit"
        disabled={pending || Boolean(disabledReason)}
        title={disabledReason}
        className="text-sm text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
      >
        {pending ? labels.deleting : labels.delete}
      </button>
      {state.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
