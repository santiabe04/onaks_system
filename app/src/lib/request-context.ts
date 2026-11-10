import "server-only";
import { headers } from "next/headers";
import { parseClientIp } from "./audit-data";

export type RequestContext = { ip: string | null; userAgent: string | null };

// A user agent does not have to be long: it is cut so it does not fill the table.
const MAX_USER_AGENT_LENGTH = 512;

/** Request IP and user agent, for auditing and the login lock. */
export async function getRequestContext(): Promise<RequestContext> {
  const list = await headers();
  return {
    ip: parseClientIp(list.get("x-forwarded-for"), list.get("x-real-ip")),
    userAgent: list.get("user-agent")?.slice(0, MAX_USER_AGENT_LENGTH) || null,
  };
}
