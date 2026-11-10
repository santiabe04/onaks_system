"use client";

import { useActionState } from "react";

export type DeleteState = { error?: string };

type Props = {
  /** The delete action with the id already bound. */
  action: (state: DeleteState) => Promise<DeleteState>;
  confirmMessage: string;
  labels: { delete: string; deleting: string };
  /** If set, the button is disabled and the reason is shown on hover. */
  disabledReason?: string;
};

/** "Delete" button for a row: asks for confirmation and shows the action's error. */
export function DeleteButton({
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
