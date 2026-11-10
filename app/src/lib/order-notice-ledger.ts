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

// Cola de avisos por mail al cliente. El aviso se guarda en la misma
// transacción que el cambio de estado (si se deshace, no queda) y se envía
// después de responder; un mail caído nunca frena un cambio de estado.

type Client = Prisma.TransactionClient | typeof db;

export type NoticeRecipient = {
  name: string;
  mail: string;
  phone: string | null;
};

/**
 * A quién se le avisa de un pedido: a la persona que lo hizo si es del cliente
 * y, si lo cargó el admin, a la persona más antigua de la empresa con usuario.
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
 * Deja en cola el aviso de un estado (uno por pedido y estado) y programa el
 * envío para después de la respuesta. Sin SMTP o sin destinatario no hace nada.
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
    // Fuera de un request (un script): los toma el próximo envío.
  }
}

const BATCH = 20;
const STUCK_MINUTES = 5;

/**
 * Envía los avisos en cola: toma un lote (sin pisarse con otro envío), manda
 * cada mail y registra el resultado. Los que fallan quedan en cola para el
 * próximo envío hasta agotar los intentos y pasan a fallidos.
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
