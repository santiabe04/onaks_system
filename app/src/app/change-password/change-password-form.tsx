"use client";

import { useActionState } from "react";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
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
      <Field label="Contraseña actual" error={state.errors?.currentPassword}>
        <Input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field
        label={`Contraseña nueva (mínimo ${MIN_PASSWORD_LENGTH} caracteres)`}
        error={state.errors?.newPassword}
      >
        <Input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </Field>
      <Field
        label="Repetí la contraseña nueva"
        error={state.errors?.confirmPassword}
      >
        <Input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </Field>

      <FormError messages={state.errors?.form} />

      <SubmitButton pending={pending} pendingLabel="Guardando…">
        Cambiar contraseña
      </SubmitButton>
    </form>
  );
}
