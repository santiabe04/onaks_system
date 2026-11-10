import "server-only";
import { db } from "@/lib/db";

/**
 * Active internal users to link to a driver: those not yet
 * linked and, when editing, the one already linked.
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
