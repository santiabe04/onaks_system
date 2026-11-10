import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import {
  LOCK_WINDOW_MS,
  lockedUntil,
  mailLockedUntil,
  MAX_FAILURES_PER_MAIL,
  MAX_FAILURES_PER_MAIL_IP,
  pickLock,
  type Lock,
} from "./login-throttle";

/**
 * Current lock for this email (and IP), or null. Only the failures
 * after that email's last successful login count.
 */
export async function getLoginLock(
  mail: string,
  ip: string | null,
  now = new Date(),
): Promise<Lock | null> {
  const windowStart = new Date(now.getTime() - LOCK_WINDOW_MS);
  const lastSuccess = await db.loginAttempt.findFirst({
    where: { mail, success: true, createdAt: { gt: windowStart } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const since = lastSuccess?.createdAt ?? windowStart;

  const failures = (where: Prisma.LoginAttemptWhereInput, take: number) =>
    db.loginAttempt
      .findMany({
        where: { ...where, mail, success: false, createdAt: { gt: since } },
        orderBy: { createdAt: "desc" },
        take,
        select: { createdAt: true },
      })
      .then((rows) => rows.map((row) => row.createdAt));

  const [byMailIp, byMail] = await Promise.all([
    failures({ ip }, MAX_FAILURES_PER_MAIL_IP),
    failures({}, MAX_FAILURES_PER_MAIL),
  ]);

  return pickLock(
    lockedUntil(byMailIp, MAX_FAILURES_PER_MAIL_IP, now),
    lockedUntil(byMail, MAX_FAILURES_PER_MAIL, now),
  );
}

/** Failures that count toward the lock: within the window and after the last successful login. */
async function recentFailuresWhere(
  mails: string[],
  now: Date,
): Promise<Prisma.LoginAttemptWhereInput> {
  const windowStart = new Date(now.getTime() - LOCK_WINDOW_MS);
  const successes = await db.loginAttempt.groupBy({
    by: ["mail"],
    where: {
      mail: { in: mails },
      success: true,
      createdAt: { gt: windowStart },
    },
    _max: { createdAt: true },
  });
  const since = new Map(successes.map((s) => [s.mail, s._max.createdAt!]));
  return {
    success: false,
    OR: mails.map((mail) => ({
      mail,
      createdAt: { gt: since.get(mail) ?? windowStart },
    })),
  };
}

/**
 * For the admin: which emails are locked now and until when, from
 * any IP. Those not listed are not locked.
 */
export async function getLockedMails(
  mails: string[],
  now = new Date(),
): Promise<Map<string, Date>> {
  const result = new Map<string, Date>();
  if (mails.length === 0) return result;
  const failures = await db.loginAttempt.findMany({
    where: await recentFailuresWhere(mails, now),
    select: { mail: true, ip: true, createdAt: true },
  });
  for (const mail of mails) {
    const until = mailLockedUntil(
      failures.filter((f) => f.mail === mail),
      now,
    );
    if (until) result.set(mail, until);
  }
  return result;
}

/**
 * Releases an email's lock: deletes its recent failures. `login_attempts`
 * is only a working counter; the history stays in the audit log.
 */
export async function clearLoginFailures(
  tx: Prisma.TransactionClient,
  mail: string,
): Promise<number> {
  const { count } = await tx.loginAttempt.deleteMany({
    where: { mail, success: false },
  });
  return count;
}
