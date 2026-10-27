"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { LoginFormState } from "@/lib/login";
import { login } from "./actions";

// Lee `?next=` del proxy. Solo esto va en Suspense, el form queda en el shell estático.
function NextInput() {
  const next = useSearchParams().get("next");
  return next ? <input type="hidden" name="next" value={next} /> : null;
}

export function LoginForm({ t }: { t: Dictionary["login"] }) {
  const [state, formAction, pending] = useActionState<LoginFormState, FormData>(
    login,
    {},
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Suspense fallback={null}>
        <NextInput />
      </Suspense>

      <Field label={t.mail}>
        <Input
          name="mail"
          type="email"
          autoComplete="username"
          defaultValue={state.mail}
          required
        />
      </Field>

      <Field label={t.password}>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <FormError messages={state.error} />

      <SubmitButton pending={pending} pendingLabel={t.pending}>
        {t.submit}
      </SubmitButton>
    </form>
  );
}
