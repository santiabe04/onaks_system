import "server-only";
import nodemailer from "nodemailer";

// Envío de mails por SMTP, configurado por env en la instalación. Sin
// SMTP_HOST (ni SMTP_FROM) la app anda igual: simplemente no manda avisos.

export type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
};

/** La configuración SMTP, o null si la instalación no la tiene. */
export function mailConfig(): MailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  return {
    host,
    port,
    // 465 es TLS directo; en los demás puertos se negocia STARTTLS.
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : port === 465,
    user: process.env.SMTP_USER?.trim() || null,
    password: process.env.SMTP_PASSWORD || null,
    from,
  };
}

export function mailEnabled(): boolean {
  return mailConfig() !== null;
}

/** Manda un mail de texto. Tira un error si el servidor SMTP lo rechaza. */
export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const config = mailConfig();
  if (!config) throw new Error("SMTP not configured");
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user
      ? { user: config.user, pass: config.password ?? "" }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await transport.sendMail({ from: config.from, ...message });
  } finally {
    transport.close();
  }
}
