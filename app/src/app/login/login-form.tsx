"use client";

import { useActionState } from "react";
import type { LoginFormState } from "@/lib/login";
import { login } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginFormState, FormData>(
    login,
    {},
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
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
