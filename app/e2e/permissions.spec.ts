import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Pedidos de la demo: #1 y #2 son de Pet Shop Patitas, #3 de Veterinaria San
// Roque y #4 de Mascotas Varela (se crean en ese orden en una base nueva).

test("un cliente no entra al admin ni ve pedidos de otra empresa", async ({
  page,
}) => {
  await login(page, "patitas");

  for (const path of ["/admin", "/admin/orders", "/admin/purchases"]) {
    await page.goto(path);
    await expect(page).toHaveURL("/");
  }

  // Un pedido propio se ve; uno de otra empresa da "no encontrado".
  await page.goto("/orders/1");
  await expect(page.getByRole("heading", { name: "Pedido #1" })).toBeVisible();
  await page.goto("/orders/3");
  await expect(page.getByText("Página no encontrada")).toBeVisible();
});

test("un repartidor solo entra a sus repartos", async ({ page }) => {
  await login(page, "reparto");
  await expect(page).toHaveURL("/delivery");

  for (const path of ["/admin", "/admin/routes", "/admin/stock"]) {
    await page.goto(path);
    await expect(page).toHaveURL("/delivery");
  }
});

test("sin sesión todo lleva al login (y vuelve a donde iba)", async ({
  page,
}) => {
  await page.goto("/admin/orders");
  await expect(page).toHaveURL("/login?next=%2Fadmin%2Forders");
});
