import "server-only";
import { after } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { getActionDictionary } from "@/i18n/dictionary";
import { APP_NAME } from "./app";
import { db } from "./db";
import { mailEnabled, sendMail } from "./mailer";
import {
  buildNotice,
  NOTICE_MAX_ATTEMPTS,
  type NoticeEvent,
} from "./order-notice";

// Queue of email notices to the customer. The notice is saved in the same
// transaction as the status change (if it is rolled back, it does not remain) and it is sent
// after responding; a failed email never stops a status change.

type Client = Prisma.TransactionClient | typeof db;

export type NoticeRecipient = {
  name: string;
  mail: string;
  phone: string | null;
};

/**
 * Who gets notified about an order: the person who placed it if it is the customer's
 * and, if the admin entered it, the oldest person of the company with a user.
 */
export async function getOrderRecipient(
  client: Client,
  saleId: string,
): Promise<NoticeRecipient | null> {
  const sale = await client.sale.findUnique({
    where: { id: saleId },
    select: {
      user: {
        select: {
          person: {
            select: {
              customerId: true,
              name: true,
              mail: true,
              phone: true,
              deletedAt: true,
            },
          },
        },
      },
      address: { select: { customerId: true } },
    },
  });
  if (!sale) return null;
  const author = sale.user.person;
  if (author.customerId === sale.address.customerId && !author.deletedAt) {
    return { name: author.name, mail: author.mail, phone: author.phone };
  }
  const contact = await client.person.findFirst({
    where: {
      customerId: sale.address.customerId,
      deletedAt: null,
      user: { is: { isActive: true, deletedAt: null } },
    },
    orderBy: { createdAt: "asc" },
    select: { name: true, mail: true, phone: true },
  });
  return contact;
}

/**
 * Queues the notice for a status (one per order and status) and schedules the
 * sending for after the response. Without SMTP or without a recipient it does nothing.
 */
export async function enqueueOrderNotice(
  tx: Prisma.TransactionClient,
  sale: { id: string; number: number },
  event: NoticeEvent,
): Promise<void> {
  if (!mailEnabled()) return;
  const recipient = await getOrderRecipient(tx, sale.id);
  if (!recipient) return;
  const notice = buildNotice(event, getActionDictionary().notices, {
    name: recipient.name,
    number: sale.number,
    app: APP_NAME,
  });
  const created = await tx.orderNotification.createMany({
    data: [
      {
        saleId: sale.id,
        event,
        toMail: recipient.mail,
        subject: notice.subject,
        body: notice.body,
      },
    ],
    skipDuplicates: true,
  });
  if (created.count === 0) return;
  try {
    after(() => flushOrderNotices());
  } catch {
    // Outside a request (a script): the next send picks them up.
  }
}

const BATCH = 20;
const STUCK_MINUTES = 5;

/**
 * Sends the queued notices: takes a batch (without colliding with another send), sends
 * each email and records the result. Those that fail stay in the queue for the
 * next send until the attempts run out, and then become failed.
 */
export async function flushOrderNotices(): Promise<void> {
  if (!mailEnabled()) return;
  const claimed = await db.$queryRaw<
    {
      id: string;
      toMail: string;
      subject: string;
      body: string;
      attempts: number;
    }[]
  >`
    UPDATE "order_notifications"
    SET "attempts" = "attempts" + 1, "claimed_at" = now()
    WHERE "id" IN (
      SELECT "id" FROM "order_notifications"
      WHERE "status" = 'PENDING' AND "attempts" < ${NOTICE_MAX_ATTEMPTS}
        AND ("claimed_at" IS NULL
          OR "claimed_at" < now() - make_interval(mins => ${STUCK_MINUTES}))
      ORDER BY "created_at"
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "to_mail" AS "toMail", "subject", "body", "attempts"`;
  for (const notice of claimed) {
    try {
      await sendMail({
        to: notice.toMail,
        subject: notice.subject,
        text: notice.body,
      });
      await db.orderNotification.update({
        where: { id: notice.id },
        data: { status: "SENT", sentAt: new Date(), lastError: null },
      });
    } catch (error) {
      await db.orderNotification.update({
        where: { id: notice.id },
        data: {
          status: notice.attempts >= NOTICE_MAX_ATTEMPTS ? "FAILED" : "PENDING",
          claimedAt: null,
          lastError: (error instanceof Error ? error.message : String(error))
            .replace(/\s+/g, " ")
            .slice(0, 300),
        },
      });
    }
  }
}
