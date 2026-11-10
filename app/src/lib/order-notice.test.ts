import { describe, expect, it } from "vitest";
import {
  buildNotice,
  buildWhatsappText,
  noticeFor,
  noticeForDisplay,
  whatsappLink,
  whatsappPhone,
} from "./order-notice";

const t = {
  greeting: "Hola {name}:",
  signature: "Saludos, {app}",
  events: {
    PENDING: {
      subject: "Pedido #{number} confirmado",
      body: "Recibimos tu pedido #{number}.",
    },
    PREPARING: {
      subject: "Preparando #{number}",
      body: "Estamos preparando tu pedido #{number}.",
    },
    OUT_FOR_DELIVERY: {
      subject: "En camino #{number}",
      body: "Tu pedido #{number} salió a reparto.",
    },
    DELIVERED: {
      subject: "Entregado #{number}",
      body: "Entregamos tu pedido #{number}.",
    },
  },
} as never;

describe("noticeFor", () => {
  it("avisa los cambios hacia adelante a los cuatro estados", () => {
    expect(noticeFor("PENDING", "PREPARING")).toBe("PREPARING");
    expect(noticeFor("READY_TO_SHIP", "OUT_FOR_DELIVERY")).toBe(
      "OUT_FOR_DELIVERY",
    );
    expect(noticeFor("OUT_FOR_DELIVERY", "DELIVERED")).toBe("DELIVERED");
  });

  it("saltear pasos avisa el estado al que llegó", () => {
    expect(noticeFor("PENDING", "DELIVERED")).toBe("DELIVERED");
  });

  it("no avisa volver atrás, cancelar ni estados intermedios", () => {
    expect(noticeFor("OUT_FOR_DELIVERY", "READY_TO_SHIP")).toBeNull();
    expect(noticeFor("DELIVERED", "OUT_FOR_DELIVERY")).toBeNull();
    expect(noticeFor("PENDING", "CANCELED")).toBeNull();
    expect(noticeFor("PREPARING", "READY_TO_SHIP")).toBeNull();
    expect(noticeFor("DELIVERED", "FINISHED")).toBeNull();
  });

  it("un pedido nuevo avisa que quedó confirmado", () => {
    expect(noticeFor(null, "PENDING")).toBe("PENDING");
    expect(noticeFor(null, "PREPARING")).toBeNull();
  });
});

describe("noticeForDisplay", () => {
  it("elige el texto del botón de WhatsApp según el estado actual", () => {
    expect(noticeForDisplay("PENDING")).toBe("PENDING");
    expect(noticeForDisplay("READY_TO_SHIP")).toBe("PREPARING");
    expect(noticeForDisplay("FINISHED")).toBe("DELIVERED");
    expect(noticeForDisplay("CANCELED")).toBeNull();
  });
});

describe("buildNotice y buildWhatsappText", () => {
  const vars = { name: "Lucía", number: 12, app: "Onaks System" };

  it("arma asunto y cuerpo con los datos del pedido", () => {
    const notice = buildNotice("OUT_FOR_DELIVERY", t, vars);
    expect(notice.subject).toBe("En camino #12");
    expect(notice.body).toBe(
      "Hola Lucía:\n\nTu pedido #12 salió a reparto.\n\nSaludos, Onaks System",
    );
  });

  it("el mensaje de WhatsApp es corto y de una línea", () => {
    expect(buildWhatsappText("DELIVERED", t, vars)).toBe(
      "Hola Lucía: Entregamos tu pedido #12.",
    );
  });
});

describe("whatsappPhone", () => {
  it("normaliza los formatos habituales a 549 + 10 dígitos", () => {
    expect(whatsappPhone("11 5555-1234")).toBe("5491155551234");
    expect(whatsappPhone("011 15 5555-1234")).toBe("5491155551234");
    expect(whatsappPhone("+54 9 11 5555 1234")).toBe("5491155551234");
    expect(whatsappPhone("(221) 555-1234")).toBe("5492215551234");
  });

  it("rechaza lo que no alcanza para ser un teléfono", () => {
    expect(whatsappPhone("555-1234")).toBeNull();
    expect(whatsappPhone("")).toBeNull();
  });
});

describe("whatsappLink", () => {
  it("codifica el mensaje en el link", () => {
    expect(whatsappLink("11 5555-1234", "Hola, ¿qué tal?")).toBe(
      "https://wa.me/5491155551234?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F",
    );
    expect(whatsappLink("123", "x")).toBeNull();
  });
});
