"use client";

import { useActionState } from "react";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  MIN_PASSWORD_LENGTH,
  type ChangePasswordFormState,
} from "@/lib/change-password";
import { changePassword } from "./actions";

export function ChangePasswordForm({
  t,
  pendingLabel,
}: {
  t: Dictionary["changePassword"];
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState<
    ChangePasswordFormState,
    FormData
  >(changePassword, {});

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field label={t.current} error={state.errors?.currentPassword}>
        <Input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field
        label={interpolate(t.new, { min: MIN_PASSWORD_LENGTH })}
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
      <Field label={t.confirm} error={state.errors?.confirmPassword}>
        <Input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </Field>

      <FormError messages={state.errors?.form} />

      <SubmitButton pending={pending} pendingLabel={pendingLabel}>
        {t.submit}
      </SubmitButton>
    </form>
  );
}
