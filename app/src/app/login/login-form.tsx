"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import type { LoginFormState } from "@/lib/login";
import { login } from "./actions";

// Lee `?next=` del proxy. Solo esto va en Suspense, el form queda en el shell estático.
function NextInput() {
  const next = useSearchParams().get("next");
  return next ? <input type="hidden" name="next" value={next} /> : null;
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginFormState, FormData>(
    login,
    {},
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Suspense fallback={null}>
        <NextInput />
      </Suspense>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Mail</span>
        <input
          name="mail"
          type="email"
          autoComplete="username"
          defaultValue={state.mail}
          required
          className="rounded border border-current/20 bg-transparent px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded border border-current/20 bg-transparent px-3 py-2"
        />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-foreground text-background rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
