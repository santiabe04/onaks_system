import bcrypt from "bcryptjs";

const COST = 12;

// Hash of a random password nobody knows. When the email does not exist it is
// compared against this one, so the login takes the same time and does not reveal which emails
// are registered.
const DUMMY_HASH =
  "$2b$12$Wy.1012oVDIfKtIFVxTtBOoWTmjs7m5TdIZh/xoaTwRDrMxaUvGDO";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

/** Always compares, even if there is no hash (nonexistent user): constant time. */
export async function verifyPassword(
  password: string,
  hash: string | null,
): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== null && matches;
}
