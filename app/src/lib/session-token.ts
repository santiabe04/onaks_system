import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { UserType } from "@/generated/prisma/enums";

// Sin "server-only" ni Prisma: lo importa también el proxy y los tests.

export const SESSION_COOKIE = "onaks_session";
/** Vida de la sesión, en segundos (7 días). */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type SessionPayload = {
  userId: string;
  role: UserType;
  mustChangePassword: boolean;
  /** Copia de `users.session_version`: si no coincide, la sesión fue revocada. */
  sessionVersion: number;
};

const ALGORITHM = "HS256";

const claimsSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(UserType),
  mustChangePassword: z.boolean(),
  // Tokens emitidos antes de que existiera: valen como versión 0.
  sv: z.number().int().nonnegative().default(0),
});

// Se lee al usarla, no al importar: `next build` corre sin SESSION_SECRET.
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

/** Devuelve el contenido del token si la firma y el vencimiento son válidos. */
export async function verifySession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  // Fuera del try: un secreto mal configurado tiene que romper, no desloguear.
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
