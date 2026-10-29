import { expect, test } from "@playwright/test";
import { login, numberFromUrl } from "./helpers";

test("el cliente arma el carrito, confirma el pedido y lo ve en Mis pedidos", async ({
  page,
}) => {
  await login(page, "patitas");
  await expect(page).toHaveURL("/");

  // Dos productos desde las tarjetas del catálogo (uno por unidad, otro a granel).
  const dogFood = page
    .getByRole("listitem")
    .filter({ hasText: "Alimento perro adulto 3 kg" });
  await dogFood.getByLabel("Cantidad").fill("2");
  await dogFood.getByRole("button", { name: "Agregar" }).click();
  await expect(dogFood.getByText("Agregado al carrito")).toBeVisible();

  const catFood = page
    .getByRole("listitem")
    .filter({ hasText: "Alimento gato suelto" });
  await catFood.getByLabel("Cantidad").fill("1.5");
  await catFood.getByRole("button", { name: "Agregar" }).click();
  await expect(catFood.getByText("Agregado al carrito")).toBeVisible();

  // Carrito: 2 × $ 6.900 neto (IVA 10,5 %) + 1,5 kg × $ 3.950 neto (IVA 10,5 %).
  await page.getByRole("link", { name: "Carrito (2)" }).click();
  await expect(page.getByRole("heading", { name: "Carrito" })).toBeVisible();
  await expect(page.getByText("$ 21.796,13").first()).toBeVisible();
  await page.getByRole("link", { name: "Continuar con el pedido" }).click();

  await page.getByLabel(/Local Quilmes/).check();
  await page.getByLabel("Comentario (opcional)").fill("Pedido de prueba e2e");
  await page.getByRole("button", { name: "Confirmar pedido" }).click();

  await expect(page).toHaveURL(/\/orders\/\d+\?created=1/);
  const number = numberFromUrl(page.url());
  await expect(page.getByText("Pedido de prueba e2e")).toBeVisible();

  // En Mis pedidos, pendiente y con el carrito vacío.
  await page.goto("/orders");
  const row = page.getByRole("row").filter({ hasText: `#${number}` });
  await expect(row).toContainText("Pendiente");
  await expect(row).toContainText("$ 21.796,13");
  await expect(page.getByRole("link", { name: "Carrito (0)" })).toBeVisible();
});
