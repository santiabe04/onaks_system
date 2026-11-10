// Shared classes for <button> and <Link>, so a "New unit" link and the
// submit of a form look the same without duplicating Tailwind.
const VARIANTS = {
  primary: "bg-foreground text-background font-medium",
  secondary: "border border-current/20",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function buttonClass(variant: ButtonVariant = "primary"): string {
  return `inline-flex items-center justify-center rounded px-4 py-2 text-sm disabled:opacity-50 ${VARIANTS[variant]}`;
}
