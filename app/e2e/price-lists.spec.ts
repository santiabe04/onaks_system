import { expect, test } from "@playwright/test";
import { login, pageAs, ready } from "./helpers";

// Lista de precios con un precio fijo, asignada a Veterinaria San Roque con un
// descuento propio: el cliente ve su precio y el base tachado.
test("el admin arma una lista, se la asigna a un cliente y el cliente ve su precio", async ({
  page,
  browser,
}) => {
  await login(page, "admin");
  await page.goto("/admin/price-lists/new");
  await page.getByLabel("Nombre").fill("Veterinarias e2e");
  await page.getByLabel("Ajuste sobre el precio base (%)").fill("-5");
  await page.getByRole("button", { name: "Crear" }).click();

  // Sigue en la lista nueva: precio fijo para la pelota.
  await expect(
    page.getByRole("heading", { name: "Editar lista de precios" }),
  ).toBeVisible();
  await ready(page);
  await page.getByLabel("Buscar producto").fill("pelota");
  await page.getByLabel("Precio fijo Pelota de goma").fill("1500");
  await page.getByRole("button", { name: "Guardar precios" }).click();
  await expect(page.getByText("Precios guardados")).toBeVisible();

  await page.goto("/admin/customers");
  await page.getByRole("link", { name: "Veterinaria San Roque" }).click();
  await page.getByRole("link", { name: "Editar" }).first().click();
  await page
    .getByRole("combobox", { name: "Lista de precios" })
    .selectOption({ label: "Veterinarias e2e" });
  await page.getByLabel("Descuento propio (%)").fill("10");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(
    page.getByText("Precios: Veterinarias e2e · descuento 10%"),
  ).toBeVisible();

  // Pelota: fijo $ 1.500 − 10 % = $ 1.350 neto + IVA 21 % = $ 1.633,50; el
  // base ($ 1.800 + IVA) tachado.
  const client = await pageAs(browser, "sanroque");
  await client.goto("/?q=pelota");
  const card = client
    .getByRole("listitem")
    .filter({ hasText: "Pelota de goma" });
  await expect(card).toContainText("$ 1.633,50");
  await expect(card).toContainText("$ 2.178,00");
  await client.context().close();
});
