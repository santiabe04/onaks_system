import type { UserType } from "@/generated/prisma/enums";

// Pure and with no Next dependencies: used by the auth layer, the UI and the tests.

export const PERMISSIONS = [
  "measurement-units:manage",
  "categories:manage",
  "warehouses:manage",
  "tax-rates:manage",
  "locations:manage",
  "suppliers:manage",
  "products:manage",
  "stock:manage",
  "stock:count",
  "customers:manage",
  "price-lists:manage",
  "payment-settings:manage",
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
  "reports:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// With two fixed roles a map in code is enough: a new role is added here.
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
    "stock:count",
    "customers:manage",
    "price-lists:manage",
    "payment-settings:manage",
    "users:manage",
    "sales:read-all",
    "sales:manage",
    "catalog:read",
    "audit:read",
    "dashboard:read",
    "routes:manage",
    // An admin can also deliver (small companies).
    "routes:deliver",
    "purchases:manage",
    "reports:read",
  ],
  CLIENT: ["catalog:read", "sales:create"],
  // Only loads the deliveries of their route sheets.
  DRIVER: ["routes:deliver"],
};

export function can(role: UserType, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Ownership: the admin sees everything; the customer only what belongs to their company.
 * For orders, addresses, etc. that hang from a `customer_id`.
 */
export function canAccessCustomer(
  user: { role: UserType; customerId: string | null },
  customerId: string,
): boolean {
  if (user.role === "ADMIN") return true;
  return user.customerId !== null && user.customerId === customerId;
}
