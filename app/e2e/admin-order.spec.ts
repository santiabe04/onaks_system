import { expect, test } from "@playwright/test";
import { login, numberFromUrl, pageAs, ready } from "./helpers";

// Un pedido que llega por teléfono: el admin lo carga para Veterinaria San
// Roque y el cliente lo ve en Mis pedidos como hecho por la distribuidora.
test("el admin carga un pedido por un cliente y el cliente lo ve", async ({
  page,
  browser,
}) => {
  await login(page, "admin");
  await page.goto("/admin/orders/new");
  await ready(page);

  await page.getByLabel("Buscar cliente (nombre o CUIT)").fill("san roque");
  await page
    .getByRole("combobox", { name: "Cliente" })
    .selectOption({ index: 1 }); // el único que queda con la búsqueda
  // Tiene una sola dirección: queda elegida sola.
  await expect(page.getByRole("radio", { name: /Consultorio/ })).toBeChecked();

  await page
    .getByLabel("Buscar producto (nombre, SKU o código de barras)")
    .fill("pelota");
  await page
    .getByRole("listitem")
    .filter({ hasText: "Pelota de goma" })
    .getByRole("button", { name: "Agregar" })
    .click();
  await page.getByLabel("Cantidad Pelota de goma").fill("3");
  // 3 × $ 1.800 neto + IVA 21 %.
  await expect(page.getByText("$ 6.534,00").first()).toBeVisible();

  await page.getByLabel("Comentario (opcional)").fill("Pedido telefónico e2e");
  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  await expect(page).toHaveURL(/\/admin\/orders\/\d+$/);
  const number = numberFromUrl(page.url());
  await expect(page.getByText("Pendiente").first()).toBeVisible();

  const client = await pageAs(browser, "sanroque");
  await client.goto("/orders");
  const row = client.getByRole("row").filter({ hasText: `#${number}` });
  await expect(row).toContainText("La distribuidora");
  await expect(row).toContainText("$ 6.534,00");
  await client.context().close();
});
