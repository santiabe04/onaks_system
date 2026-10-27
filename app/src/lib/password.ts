import bcrypt from "bcryptjs";

const COST = 12;

// Hash de una contraseña al azar que nadie conoce. Cuando el mail no existe se
// compara contra este, para que el login tarde lo mismo y no revele qué mails
// están registrados.
const DUMMY_HASH =
  "$2b$12$Wy.1012oVDIfKtIFVxTtBOoWTmjs7m5TdIZh/xoaTwRDrMxaUvGDO";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

/** Compara siempre, aunque no haya hash (user inexistente): tiempo constante. */
export async function verifyPassword(
  password: string,
  hash: string | null,
): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== null && matches;
}
