import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { UserType } from "@/generated/prisma/enums";

// Without "server-only" or Prisma: the proxy and the tests also import it.

export const SESSION_COOKIE = "onaks_session";
/** Session lifetime, in seconds (7 days). */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type SessionPayload = {
  userId: string;
  role: UserType;
  mustChangePassword: boolean;
  /** Copy of `users.session_version`: if it does not match, the session was revoked. */
  sessionVersion: number;
};

const ALGORITHM = "HS256";

const claimsSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(UserType),
  mustChangePassword: z.boolean(),
  // Tokens issued before it existed: they are valid as version 0.
  sv: z.number().int().nonnegative().default(0),
});

// Read when used, not when imported: `next build` runs without SESSION_SECRET.
function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET falta o es muy corto (mínimo 32 caracteres)",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    role: payload.role,
    mustChangePassword: payload.mustChangePassword,
    sv: payload.sessionVersion,
  })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getKey());
}

/** Returns the token's content if the signature and the expiry are valid. */
export async function verifySession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  // Outside the try: a misconfigured secret must break, not log out.
  const key = getKey();
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: [ALGORITHM],
    });
    const claims = claimsSchema.safeParse(payload);
    if (!claims.success) return null;
    return {
      userId: claims.data.sub,
      role: claims.data.role,
      mustChangePassword: claims.data.mustChangePassword,
      sessionVersion: claims.data.sv,
    };
  } catch {
    return null;
  }
}
