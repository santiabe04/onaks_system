import type { SaleState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { SALE_FLOW } from "./sale-state";

// Puro: avisos al cliente por los cambios de estado de su pedido (mail y WhatsApp).

/** Los estados que se avisan: confirmado, en preparación, en reparto y entregado. */
export const NOTICE_EVENTS = [
  "PENDING",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const satisfies readonly SaleState[];
export type NoticeEvent = (typeof NOTICE_EVENTS)[number];

/** Intentos de envío antes de dejar el aviso como fallido. */
export const NOTICE_MAX_ATTEMPTS = 3;

export function isNoticeEvent(state: string): state is NoticeEvent {
  return (NOTICE_EVENTS as readonly string[]).includes(state);
}

function step(state: SaleState): number {
  return (SALE_FLOW as readonly SaleState[]).indexOf(state);
}

/**
 * ¿Este cambio de estado se avisa? Solo hacia adelante y a uno de los estados
 * de la lista (volver atrás para corregir no manda nada). Un pedido nuevo
 * (`from` null) avisa que quedó confirmado.
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
 * El aviso que corresponde mostrar para un estado en el botón de WhatsApp:
 * Listo para despachar sigue siendo "en preparación" y Finalizado "entregado".
 */
export function noticeForDisplay(state: SaleState): NoticeEvent | null {
  if (isNoticeEvent(state)) return state;
  if (state === "READY_TO_SHIP") return "PREPARING";
  if (state === "FINISHED") return "DELIVERED";
  return null;
}

export type NoticeVars = {
  /** Nombre de quien recibe. */
  name: string;
  number: number;
  /** Nombre del sistema o de la distribuidora, para la firma. */
  app: string;
};

type Messages = Dictionary["notices"];

/** Asunto y cuerpo del mail (texto plano) de un aviso. */
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

/** El mensaje corto de WhatsApp de un estado. */
export function buildWhatsappText(
  event: NoticeEvent,
  t: Messages,
  vars: NoticeVars,
): string {
  const values = { name: vars.name, number: vars.number, app: vars.app };
  return `${interpolate(t.greeting, values)} ${interpolate(t.events[event].body, values)}`;
}

/**
 * Teléfono para wa.me: solo dígitos, con el 54 de Argentina. "11 5555-1234" →
 * "5491155551234" (los celulares llevan un 9 después del 54); null si no
 * alcanza para ser un número.
 */
export function whatsappPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("54")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  // Prefijo de celular viejo: 0 11 15 5555-1234 → el 15 sobra.
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

/** Link que abre WhatsApp con el mensaje armado (sin API). */
export function whatsappLink(phone: string, text: string): string | null {
  const number = whatsappPhone(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
