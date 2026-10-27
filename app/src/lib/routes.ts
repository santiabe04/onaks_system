import type { UserType } from "@/generated/prisma/enums";

export const LOGIN_PATH = "/login";

/** Adónde va cada rol al entrar o cuando intenta abrir algo que no le corresponde. */
export function homePathFor(role: UserType): string {
  // Hasta que exista el panel de admin, su inicio es el ABM de unidades.
  return role === "ADMIN" ? "/admin/measurement-units" : "/";
}
