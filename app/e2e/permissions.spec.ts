import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Demo orders: #1 and #2 are from Pet Shop Patitas, #3 from Veterinaria San
// Roque and #4 from Mascotas Varela (they are created in that order on a new database).

test("un cliente no entra al admin ni ve pedidos de otra empresa", async ({
  page,
}) => {
  await login(page, "patitas");

  for (const path of ["/admin", "/admin/orders", "/admin/purchases"]) {
    await page.goto(path);
    await expect(page).toHaveURL("/");
  }

  // Your own order is visible; another company's gives "not found".
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
