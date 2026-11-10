import type { SaleState } from "@/generated/prisma/enums";
import { NoticeRetryButton } from "@/components/orders/notice-retry-button";
import { APP_NAME } from "@/lib/app";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { formatters } from "@/i18n/format";
import { db } from "@/lib/db";
import { mailEnabled } from "@/lib/mailer";
import {
  buildWhatsappText,
  noticeForDisplay,
  whatsappLink,
} from "@/lib/order-notice";
import { getOrderRecipient } from "@/lib/order-notice-ledger";

/** Customer notices for an order: what was sent by email and the WhatsApp button. */
export async function OrderNotices({
  sale,
  canManage,
  format,
  t,
  states,
}: {
  sale: { id: string; number: number; state: SaleState };
  canManage: boolean;
  format: ReturnType<typeof formatters>;
  t: Dictionary;
  states: Record<string, string>;
}) {
  const n = t.orderNotices;
  const [notices, recipient] = await Promise.all([
    db.orderNotification.findMany({
      where: { saleId: sale.id },
      orderBy: { createdAt: "asc" },
    }),
    getOrderRecipient(db, sale.id),
  ]);
  const event = noticeForDisplay(sale.state);
  const link =
    recipient?.phone && event
      ? whatsappLink(
          recipient.phone,
          buildWhatsappText(event, t.notices, {
            name: recipient.name,
            number: sale.number,
            app: APP_NAME,
          }),
        )
      : null;

  return (
    <section className="mt-8 rounded border border-current/20 p-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">{n.title}</h2>
        {event && recipient && (
          <div className="flex flex-col items-end gap-1">
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-current/20 px-3 py-2 text-sm"
              >
                {n.whatsapp}
              </a>
            ) : (
              <span className="text-xs opacity-70">{n.noPhone}</span>
            )}
            {link && (
              <span className="text-xs opacity-70">
                {interpolate(n.whatsappHint, { name: recipient.name })}
              </span>
            )}
          </div>
        )}
      </div>
      {!mailEnabled() && <p className="mt-2 text-sm opacity-70">{n.noMail}</p>}
      {notices.length === 0 ? (
        <p className="mt-2 text-sm opacity-70">{n.none}</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">{n.columns.event}</th>
                <th className="py-2 pr-3 font-medium">{n.columns.to}</th>
                <th className="py-2 pr-3 font-medium">{n.columns.status}</th>
                <th className="py-2 font-medium">{n.columns.detail}</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((notice) => (
                <tr key={notice.id} className="border-b border-current/10">
                  <td className="py-2 pr-3">{states[notice.event]}</td>
                  <td className="py-2 pr-3">{notice.toMail}</td>
                  <td
                    className={`py-2 pr-3 whitespace-nowrap ${
                      notice.status === "FAILED" ? "text-red-600" : ""
                    }`}
                  >
                    {n.statuses[notice.status]}
                  </td>
                  <td className="py-2">
                    {notice.sentAt && format.dateTime(notice.sentAt)}
                    {notice.status !== "SENT" && (
                      <>
                        {notice.lastError && (
                          <span className="block text-xs opacity-70">
                            {notice.lastError}
                          </span>
                        )}
                        {canManage && (
                          <NoticeRetryButton noticeId={notice.id} t={n} />
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
