"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { CUSTOMER_LIMITS } from "@/lib/customer";
import { createAdmin, type AdminFormState } from "./actions";
import { TempPassword } from "./user-controls";

type Props = {
  t: Dictionary["users"];
  /** Etiquetas y errores de persona: son los mismos campos que en clientes. */
  person: Dictionary["customers"];
  common: Dictionary["common"];
};

const empty = { name: "", surname: "", mail: "", phone: "" };

export function AdminForm({ t, person, common }: Props) {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(
    createAdmin,
    {},
  );

  // Creado: se muestra la contraseña generada (una sola vez) en lugar del form.
  if (state.password) {
    return (
      <div className="mt-6 flex flex-col items-start gap-4">
        <p className="text-sm">{t.adminCreated}</p>
        <TempPassword
          password={state.password}
          personName={state.name ?? ""}
          t={t}
        />
        <Link href="/admin/users" className={buttonClass("secondary")}>
          {t.backToList}
        </Link>
      </div>
    );
  }

  const values = state.values ?? empty;
  const errors = state.errors;

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={person.name} error={errors?.name}>
          <Input
            name="name"
            defaultValue={values.name}
            required
            maxLength={CUSTOMER_LIMITS.personName}
            autoComplete="off"
          />
        </Field>
        <Field label={person.surname} error={errors?.surname}>
          <Input
            name="surname"
            defaultValue={values.surname}
            required
            maxLength={CUSTOMER_LIMITS.personName}
            autoComplete="off"
          />
        </Field>
      </div>
      <Field label={person.mail} error={errors?.mail}>
        <Input
          name="mail"
          type="email"
          defaultValue={values.mail}
          required
          maxLength={CUSTOMER_LIMITS.mail}
          autoComplete="off"
        />
        <span className="text-xs opacity-60">{person.mailHint}</span>
      </Field>
      <Field label={person.phone} error={errors?.phone}>
        <Input
          name="phone"
          type="tel"
          defaultValue={values.phone}
          maxLength={CUSTOMER_LIMITS.phone}
        />
      </Field>
      <Field label={t.role}>
        <select
          key={state.role ?? "ADMIN"}
          name="role"
          defaultValue={state.role ?? "ADMIN"}
          className="rounded border border-current/20 bg-transparent px-3 py-2"
        >
          <option value="ADMIN">{t.roles.ADMIN}</option>
          <option value="DRIVER">{t.roles.DRIVER}</option>
        </select>
        <span className="text-xs opacity-60">{t.roleHint}</span>
      </Field>
      <FormError messages={errors?.form} />
      <div className="flex gap-3">
        <SubmitButton pending={pending} pendingLabel={common.saving}>
          {common.create}
        </SubmitButton>
        <Link href="/admin/users" className={buttonClass("secondary")}>
          {common.cancel}
        </Link>
      </div>
    </form>
  );
}
