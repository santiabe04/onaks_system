import "server-only";
import { headers } from "next/headers";
import { parseClientIp } from "./audit-data";

export type RequestContext = { ip: string | null; userAgent: string | null };

// Un user agent no tiene por qué ser largo: se corta para que no llenen la tabla.
const MAX_USER_AGENT_LENGTH = 512;

/** IP y user agent del request, para auditoría y bloqueo de login. */
export async function getRequestContext(): Promise<RequestContext> {
  const list = await headers();
  return {
    ip: parseClientIp(list.get("x-forwarded-for"), list.get("x-real-ip")),
    userAgent: list.get("user-agent")?.slice(0, MAX_USER_AGENT_LENGTH) || null,
  };
}
