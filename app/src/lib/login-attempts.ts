import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import {
  LOCK_WINDOW_MS,
  lockedUntil,
  MAX_FAILURES_PER_MAIL,
  MAX_FAILURES_PER_MAIL_IP,
  pickLock,
  type Lock,
} from "./login-throttle";

/**
 * Bloqueo vigente para este mail (e IP), o null. Solo cuentan los fallos
 * posteriores al último login correcto de ese mail.
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
