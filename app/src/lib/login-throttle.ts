// Login lock rules, no DB: the queries are in `login-attempts`.

export const LOCK_WINDOW_MS = 15 * 60 * 1000;
/** Failures from the same IP against an email. */
export const MAX_FAILURES_PER_MAIL_IP = 5;
/** Failures against an email from any IP (distributed attack or a forged IP). */
export const MAX_FAILURES_PER_MAIL = 20;

export type LockScope = "mail_ip" | "mail";
export type Lock = { scope: LockScope; until: Date };

/**
 * Until when the lock lasts, or null if there is none. `failures` are the dates of
 * the most recent failures, from newest to oldest: with `max` failures
 * within the window, it is released when the `max`-th one leaves it.
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

/** Combines the two scopes: if both lock, the one that lasts longer wins. */
export function pickLock(mailIp: Date | null, mail: Date | null): Lock | null {
  if (mail && (!mailIp || mail >= mailIp))
    return { scope: "mail", until: mail };
  if (mailIp) return { scope: "mail_ip", until: mailIp };
  return null;
}

/**
 * Until when an email is locked looking at all IPs (for the admin,
 * who does not know where the attempts come from). `failures` are the failures after the
 * last successful login, in any order.
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

/** Minutes left, rounding up (never "0 min"). */
export function minutesUntil(until: Date, now: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
}
