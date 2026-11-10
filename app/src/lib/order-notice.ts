import type { SaleState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { SALE_FLOW } from "./sale-state";

// Pure: customer notices about the status changes of their order (email and WhatsApp).

/** The statuses that are notified: confirmed, being prepared, out for delivery and delivered. */
export const NOTICE_EVENTS = [
  "PENDING",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const satisfies readonly SaleState[];
export type NoticeEvent = (typeof NOTICE_EVENTS)[number];

/** Send attempts before the notice is left as failed. */
export const NOTICE_MAX_ATTEMPTS = 3;

export function isNoticeEvent(state: string): state is NoticeEvent {
  return (NOTICE_EVENTS as readonly string[]).includes(state);
}

function step(state: SaleState): number {
  return (SALE_FLOW as readonly SaleState[]).indexOf(state);
}

/**
 * Is this status change notified? Only forward, and to one of the statuses
 * in the list (going back to fix something sends nothing). A new order
 * (`from` null) notifies that it was confirmed.
 */
export function noticeFor(
  from: SaleState | null,
  to: SaleState,
): NoticeEvent | null {
  if (!isNoticeEvent(to)) return null;
  if (from === null) return to === "PENDING" ? to : null;
  return step(to) > step(from) ? to : null;
}

/**
 * The notice that applies to show for a status on the WhatsApp button:
 * Ready to ship is still "being prepared" and Finished "delivered".
 */
export function noticeForDisplay(state: SaleState): NoticeEvent | null {
  if (isNoticeEvent(state)) return state;
  if (state === "READY_TO_SHIP") return "PREPARING";
  if (state === "FINISHED") return "DELIVERED";
  return null;
}

export type NoticeVars = {
  /** Name of the recipient. */
  name: string;
  number: number;
  /** Name of the system or the distributor, for the signature. */
  app: string;
};

type Messages = Dictionary["notices"];

/** Subject and body of the email (plain text) of a notice. */
export function buildNotice(
  event: NoticeEvent,
  t: Messages,
  vars: NoticeVars,
): { subject: string; body: string } {
  const text = t.events[event];
  const values = { name: vars.name, number: vars.number, app: vars.app };
  return {
    subject: interpolate(text.subject, values),
    body: `${interpolate(t.greeting, values)}\n\n${interpolate(text.body, values)}\n\n${interpolate(t.signature, values)}`,
  };
}

/** The short WhatsApp message for a status. */
export function buildWhatsappText(
  event: NoticeEvent,
  t: Messages,
  vars: NoticeVars,
): string {
  const values = { name: vars.name, number: vars.number, app: vars.app };
  return `${interpolate(t.greeting, values)} ${interpolate(t.events[event].body, values)}`;
}

/**
 * Phone for wa.me: digits only, with Argentina's 54. "11 5555-1234" →
 * "5491155551234" (mobiles carry a 9 after the 54); null if it does not
 * make up a number.
 */
export function whatsappPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("54")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  // Old mobile prefix: 0 11 15 5555-1234 → the 15 is dropped.
  digits = digits.replace(/^9/, "");
  const withoutFifteen = /^(\d{2,4})15(\d{6,8})$/.exec(digits);
  if (
    withoutFifteen &&
    withoutFifteen[1].length + withoutFifteen[2].length === 10
  ) {
    digits = withoutFifteen[1] + withoutFifteen[2];
  }
  if (digits.length !== 10) return null;
  return `549${digits}`;
}

/** Link that opens WhatsApp with the message filled in (no API). */
export function whatsappLink(phone: string, text: string): string | null {
  const number = whatsappPhone(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
