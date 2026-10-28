import type { UserType } from "@/generated/prisma/enums";

// Puro y sin dependencias de Next: lo usan la capa de auth, la UI y los tests.

export const PERMISSIONS = [
  "measurement-units:manage",
  "categories:manage",
  "warehouses:manage",
  "tax-rates:manage",
  "locations:manage",
  "suppliers:manage",
  "products:manage",
  "stock:manage",
  "customers:manage",
  "users:manage",
  "sales:read-all",
  "sales:manage",
  "sales:create",
  "catalog:read",
  "audit:read",
  "dashboard:read",
  "routes:manage",
  "routes:deliver",
  "purchases:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Con dos roles fijos alcanza un mapa en código: un rol nuevo se agrega acá.
export const ROLE_PERMISSIONS: Record<UserType, readonly Permission[]> = {
  ADMIN: [
    "measurement-units:manage",
    "categories:manage",
    "warehouses:manage",
    "tax-rates:manage",
    "locations:manage",
    "suppliers:manage",
    "products:manage",
    "stock:manage",
    "customers:manage",
    "users:manage",
    "sales:read-all",
    "sales:manage",
    "catalog:read",
    "audit:read",
    "dashboard:read",
    "routes:manage",
    // Un admin también puede repartir (empresas chicas).
    "routes:deliver",
    "purchases:manage",
  ],
  CLIENT: ["catalog:read", "sales:create"],
  // Solo carga las entregas de sus hojas de ruta.
  DRIVER: ["routes:deliver"],
};

export function can(role: UserType, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Pertenencia: el admin ve todo; el cliente solo lo de su empresa.
 * Para pedidos, direcciones, etc. que cuelgan de un `customer_id`.
 */
export function canAccessCustomer(
  user: { role: UserType; customerId: string | null },
  customerId: string,
): boolean {
  if (user.role === "ADMIN") return true;
  return user.customerId !== null && user.customerId === customerId;
}
