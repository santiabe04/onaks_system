"use client";

import { useActionState } from "react";
import {
  MIN_PASSWORD_LENGTH,
  type ChangePasswordFormState,
} from "@/lib/change-password";
import { changePassword } from "./actions";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<
    ChangePasswordFormState,
    FormData
  >(changePassword, {});

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <PasswordField
        name="currentPassword"
        label="Contraseña actual"
        autoComplete="current-password"
        error={state.errors?.currentPassword}
      />
      <PasswordField
        name="newPassword"
        label={`Contraseña nueva (mínimo ${MIN_PASSWORD_LENGTH} caracteres)`}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        error={state.errors?.newPassword}
      />
      <PasswordField
        name="confirmPassword"
        label="Repetí la contraseña nueva"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        error={state.errors?.confirmPassword}
      />

      {state.errors?.form && (
        <p role="alert" className="text-sm text-red-600">
          {state.errors.form.join(". ")}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-foreground text-background rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}

function PasswordField({
  name,
  label,
  autoComplete,
  minLength,
  error,
}: {
  name: string;
  label: string;
  autoComplete: string;
  minLength?: number;
  error?: string[];
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type="password"
        autoComplete={autoComplete}
        minLength={minLength}
        required
        className="rounded border border-current/20 bg-transparent px-3 py-2"
      />
      {error && <span className="text-red-600">{error.join(". ")}</span>}
    </label>
  );
}
