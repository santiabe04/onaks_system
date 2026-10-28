// Reglas del bloqueo de login, sin DB: las consultas están en `login-attempts`.

export const LOCK_WINDOW_MS = 15 * 60 * 1000;
/** Fallos desde una misma IP contra un mail. */
export const MAX_FAILURES_PER_MAIL_IP = 5;
/** Fallos contra un mail desde cualquier IP (ataque distribuido o IP falseada). */
export const MAX_FAILURES_PER_MAIL = 20;

export type LockScope = "mail_ip" | "mail";
export type Lock = { scope: LockScope; until: Date };

/**
 * Hasta cuándo dura el bloqueo, o null si no hay. `failures` son las fechas de
 * los fallos más recientes, de la más nueva a la más vieja: con `max` fallos
 * dentro de la ventana, se libera cuando el `max`-ésimo sale de ella.
 */
export function lockedUntil(
  failures: Date[],
  max: number,
  now: Date,
): Date | null {
  if (failures.length < max) return null;
  const until = new Date(failures[max - 1].getTime() + LOCK_WINDOW_MS);
  return until > now ? until : null;
}

/** Combina los dos alcances: si los dos bloquean, manda el que dura más. */
export function pickLock(mailIp: Date | null, mail: Date | null): Lock | null {
  if (mail && (!mailIp || mail >= mailIp))
    return { scope: "mail", until: mail };
  if (mailIp) return { scope: "mail_ip", until: mailIp };
  return null;
}

/**
 * Hasta cuándo está bloqueado un mail mirando todas las IPs (para el admin,
 * que no sabe desde dónde intentan). `failures` son los fallos posteriores al
 * último login correcto, de cualquier orden.
 */
export function mailLockedUntil(
  failures: { ip: string | null; createdAt: Date }[],
  now: Date,
): Date | null {
  const newestFirst = (dates: Date[]) =>
    [...dates].sort((a, b) => b.getTime() - a.getTime());
  const byIp = new Map<string | null, Date[]>();
  for (const failure of failures) {
    byIp.set(failure.ip, [...(byIp.get(failure.ip) ?? []), failure.createdAt]);
  }
  const candidates = [
    lockedUntil(
      newestFirst(failures.map((f) => f.createdAt)),
      MAX_FAILURES_PER_MAIL,
      now,
    ),
    ...[...byIp.values()].map((dates) =>
      lockedUntil(newestFirst(dates), MAX_FAILURES_PER_MAIL_IP, now),
    ),
  ].filter((date): date is Date => date !== null);
  return candidates.length === 0
    ? null
    : new Date(Math.max(...candidates.map((date) => date.getTime())));
}

/** Minutos que faltan, redondeando para arriba (nunca "0 min"). */
export function minutesUntil(until: Date, now: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
}
