import "server-only";
import { notFound } from "next/navigation";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";

/**
 * Cliente vigente con sus personas y direcciones vigentes, para las pantallas
 * del cliente. Chequea el permiso; si no existe o está dado de baja, 404.
 */
export async function loadCustomer(id: string) {
  await getUserWithPermission("customers:manage");
  if (!isCuid(id)) notFound();

  const customer = await db.customer.findFirst({
    where: { id, deletedAt: null },
    include: {
      persons: {
        where: { deletedAt: null },
        orderBy: [{ surname: "asc" }, { name: "asc" }],
        include: {
          user: {
            where: { deletedAt: null },
            select: { id: true, isActive: true, passwordMustChange: true },
          },
        },
      },
      addresses: {
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        include: { city: { select: { name: true } } },
      },
    },
  });
  if (!customer) notFound();
  return customer;
}
