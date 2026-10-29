import { expect, type Browser, type Page } from "@playwright/test";

// Usuarios de la demo del seed (prisma/seed-demo.ts): todos con la misma
// contraseña y sin cambio obligatorio.
export const DEMO_PASSWORD = "demo1234";
export type DemoUser = "admin" | "reparto" | "patitas" | "sanroque" | "varela";

export function demoMail(user: DemoUser): string {
  return `${user}@demo.onaks.local`;
}

/** Entra con el form de login y espera salir de /login. */
export async function login(page: Page, user: DemoUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Mail").fill(demoMail(user));
  await page.getByLabel("Contraseña").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Una página con su propio contexto (cookies) ya logueada. */
export async function pageAs(browser: Browser, user: DemoUser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, user);
  return page;
}

/** El número de pedido de una URL como /orders/12 o /admin/orders/12. */
export function numberFromUrl(url: string): number {
  const match = /\/(\d+)(?:\?|$|\/)/.exec(new URL(url).pathname + "/");
  if (!match) throw new Error(`Sin número en ${url}`);
  return Number(match[1]);
}

/**
 * Espera a que la página termine de cargar (y React de hidratar) antes de
 * tocar forms con campos controlados: si no, la hidratación pisa lo tipeado.
 */
export async function ready(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}
