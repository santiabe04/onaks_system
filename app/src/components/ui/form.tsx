import type { ComponentProps, ReactNode } from "react";
import { buttonClass } from "./button";

// Piezas de formulario sin estado: sirven en Server y Client Components.

/** Label + control + errores del campo (los que devuelve la Server Action). */
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string[];
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error && <span className="text-red-600">{error.join(". ")}</span>}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={`rounded border border-current/20 bg-transparent px-3 py-2 ${className ?? ""}`}
    />
  );
}

/** Error general del form (no de un campo). No renderiza nada si no hay. */
export function FormError({ messages }: { messages?: string[] | string }) {
  const text = Array.isArray(messages) ? messages.join(". ") : messages;
  if (!text) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {text}
    </p>
  );
}

/** `pending` viene de useActionState: mientras corre la action no se reenvía. */
export function SubmitButton({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel: string;
  children: ReactNode;
}) {
  return (
    <button type="submit" disabled={pending} className={buttonClass()}>
      {pending ? pendingLabel : children}
    </button>
  );
}
