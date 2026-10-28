"use client";

import { useActionState, useState } from "react";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { UserActionState } from "./actions";

type Action = (state: UserActionState) => Promise<UserActionState>;

type Props = {
  /** Para los textos de confirmación y de la contraseña temporal. */
  personName: string;
  user: { isActive: boolean; mustChange: boolean } | null;
  /** Hora hasta la que está bloqueado el login, ya formateada; null si no. */
  lockedUntil: string | null;
  /** El propio admin: no se blanquea ni se desactiva a sí mismo. */
  isSelf: boolean;
  actions: {
    create: Action;
    reset: Action;
    deactivate: Action;
    reactivate: Action;
    unlock: Action;
  };
  t: Dictionary["users"];
};

const link = "text-sm hover:underline disabled:opacity-50";

/** Estado del usuario de una persona y sus acciones (crear, blanquear, desactivar, desbloquear). */
export function UserControls({
  personName,
  user,
  lockedUntil,
  isSelf,
  actions,
  t,
}: Props) {
  const [created, create, creating] = useActionState(actions.create, {});
  const [reset, doReset, resetting] = useActionState(actions.reset, {});
  const [toggled, toggle, toggling] = useActionState(
    user?.isActive ? actions.deactivate : actions.reactivate,
    {},
  );
  const [unlocked, unlock, unlocking] = useActionState(actions.unlock, {});
  // La contraseña generada vive solo en el estado del cliente: al recargar se pierde.
  const password = reset.password ?? created.password;
  const error = created.error ?? reset.error ?? toggled.error ?? unlocked.error;
  const confirmThen =
    (message: string) => (event: React.FormEvent<HTMLFormElement>) => {
      if (!confirm(interpolate(message, { name: personName }))) {
        event.preventDefault();
      }
    };

  return (
    <div className="flex flex-col items-start gap-1 text-sm">
      {!user ? (
        <form action={create}>
          <button type="submit" disabled={creating} className={link}>
            {creating ? t.creating : t.createUser}
          </button>
        </form>
      ) : (
        <>
          <span>
            {user.isActive ? t.active : t.inactive}
            {user.isActive && user.mustChange && (
              <span className="block text-xs opacity-70">{t.mustChange}</span>
            )}
            {lockedUntil && (
              <span className="block text-xs text-red-600">
                {interpolate(t.lockedUntil, { time: lockedUntil })}
              </span>
            )}
            {isSelf && <span className="text-xs opacity-60"> ({t.you})</span>}
          </span>
          {!isSelf && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {user.isActive && (
                <form action={doReset} onSubmit={confirmThen(t.confirmReset)}>
                  <button type="submit" disabled={resetting} className={link}>
                    {resetting ? t.resetting : t.resetPassword}
                  </button>
                </form>
              )}
              <form
                action={toggle}
                onSubmit={
                  user.isActive ? confirmThen(t.confirmDeactivate) : undefined
                }
              >
                <button
                  type="submit"
                  disabled={toggling}
                  className={`${link} ${user.isActive ? "text-red-600" : ""}`}
                >
                  {user.isActive ? t.deactivate : t.reactivate}
                </button>
              </form>
              {lockedUntil && (
                <form action={unlock}>
                  <button type="submit" disabled={unlocking} className={link}>
                    {t.unlock}
                  </button>
                </form>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
      {password && (
        <TempPassword password={password} personName={personName} t={t} />
      )}
    </div>
  );
}

/** La contraseña generada, con botón para copiarla. Se muestra una sola vez. */
export function TempPassword({
  password,
  personName,
  t,
}: {
  password: string;
  personName: string;
  t: Dictionary["users"];
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      role="status"
      className="mt-1 rounded border border-amber-500/60 bg-amber-500/10 p-3"
    >
      <p className="text-xs font-medium">{t.tempPasswordTitle}</p>
      <div className="mt-1 flex items-center gap-3">
        <code className="font-mono text-base select-all">{password}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(password);
            setCopied(true);
          }}
          className="text-xs hover:underline"
        >
          {copied ? t.copied : t.copy}
        </button>
      </div>
      <p className="mt-1 text-xs opacity-80">
        {interpolate(t.tempPasswordHint, { name: personName })}
      </p>
    </div>
  );
}
