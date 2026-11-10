import { expect, type Browser, type Page } from "@playwright/test";

// Demo users from the seed (prisma/seed-demo.ts): all with the same
// password and no forced change.
export const DEMO_PASSWORD = "demo1234";
export type DemoUser = "admin" | "reparto" | "patitas" | "sanroque" | "varela";

export function demoMail(user: DemoUser): string {
  return `${user}@demo.onaks.local`;
}

/** Logs in with the login form and waits to leave /login. */
export async function login(page: Page, user: DemoUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Mail").fill(demoMail(user));
  await page.getByLabel("Contraseña").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** A page with its own context (cookies) already logged in. */
export async function pageAs(browser: Browser, user: DemoUser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, user);
  return page;
}

/** The order number from a URL such as /orders/12 or /admin/orders/12. */
export function numberFromUrl(url: string): number {
  const match = /\/(\d+)(?:\?|$|\/)/.exec(new URL(url).pathname + "/");
  if (!match) throw new Error(`Sin número en ${url}`);
  return Number(match[1]);
}

/**
 * Waits for the page to finish loading (and React to hydrate) before
 * touching forms with controlled fields: otherwise hydration overwrites what was typed.
 */
export async function ready(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}
