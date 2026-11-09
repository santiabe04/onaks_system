"use client";

import { useActionState } from "react";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  TRANSFER_LIMITS,
  type TransferSettingsFormState,
  type TransferSettingsValues,
} from "@/lib/transfer";
import { saveTransferSettings } from "./actions";

export function PaymentSettingsForm({
  defaultValues,
  t,
  common,
}: {
  defaultValues: TransferSettingsValues;
  t: Dictionary["paymentSettings"];
  common: Dictionary["common"];
}) {
  const [state, action, pending] = useActionState<
    TransferSettingsFormState,
    FormData
  >(saveTransferSettings, {});
  // Con error o recién guardado, lo último que cargó el usuario.
  const values = state.values ?? defaultValues;
  const errors = state.errors;

  return (
    <form
      // key: al guardar, los campos toman lo normalizado (CUIT y CBU sin guiones).
      key={state.savedAt ?? 0}
      action={action}
      className="mt-6 flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.bankName} error={errors?.bankName}>
          <Input
            name="bankName"
            defaultValue={values.bankName}
            required
            maxLength={TRANSFER_LIMITS.bankName}
          />
        </Field>
        <Field label={t.holder} error={errors?.holder}>
          <Input
            name="holder"
            defaultValue={values.holder}
            required
            maxLength={TRANSFER_LIMITS.holder}
          />
        </Field>
      </div>
      <Field label={t.cuit} error={errors?.cuit}>
        <Input
          name="cuit"
          defaultValue={values.cuit}
          required
          inputMode="numeric"
          maxLength={13}
          placeholder="30-50001091-2"
          className="max-w-xs font-mono"
        />
      </Field>
      <Field label={t.cbu} error={errors?.cbu}>
        <Input
          name="cbu"
          defaultValue={values.cbu}
          inputMode="numeric"
          maxLength={30}
          className="font-mono"
        />
        <span className="text-xs opacity-60">{t.cbuHint}</span>
      </Field>
      <Field label={t.alias} error={errors?.alias}>
        <Input
          name="alias"
          defaultValue={values.alias}
          maxLength={20}
          className="max-w-xs font-mono"
        />
        <span className="text-xs opacity-60">{t.aliasHint}</span>
      </Field>

      <FormError messages={errors?.form} />
      {state.savedAt !== undefined && !pending && !errors && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {t.saved}
        </p>
      )}
      <div>
        <SubmitButton pending={pending} pendingLabel={common.saving}>
          {t.save}
        </SubmitButton>
      </div>
    </form>
  );
}
