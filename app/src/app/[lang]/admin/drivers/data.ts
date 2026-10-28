import "server-only";
import { db } from "@/lib/db";

/**
 * Usuarios internos activos para vincular a un repartidor: los que todavía no
 * están vinculados y, al editar, el que ya tiene.
 */
export async function getDriverUserOptions(
  roles: { ADMIN: string; DRIVER: string },
  currentUserId: string | null = null,
) {
  const users = await db.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      userType: { in: ["ADMIN", "DRIVER"] },
      OR: [{ driver: null }, ...(currentUserId ? [{ id: currentUserId }] : [])],
    },
    select: {
      id: true,
      userType: true,
      person: { select: { name: true, surname: true } },
    },
    orderBy: [{ person: { name: "asc" } }, { person: { surname: "asc" } }],
  });
  return users.map((user) => ({
    id: user.id,
    label: `${user.person.name} ${user.person.surname} (${
      user.userType === "DRIVER" ? roles.DRIVER : roles.ADMIN
    })`,
  }));
}
