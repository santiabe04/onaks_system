import { expect, test } from "@playwright/test";
import { login, numberFromUrl, pageAs, ready } from "./helpers";

// Mascotas Varela already owes order #4 (pending, $ 427.000 net): with a
// limit of $ 100.000 its new order is held until the admin
// approves it.
test("un pedido que supera el límite de crédito queda retenido hasta aprobarlo", async ({
  page,
  browser,
}) => {
  await login(page, "admin");
  await page.goto("/admin/customers");
  await page.getByRole("link", { name: "Mascotas Varela" }).click();
  await page.getByRole("link", { name: "Editar" }).first().click();
  await page.getByLabel("Límite de crédito (opcional)").fill("100000");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(
    // Intl puts a non-breaking space between the sign and the number: \s includes it.
    page.getByText(/Crédito: usado .* de \$\s100\.000,00/),
  ).toBeVisible();

  // The customer confirms anyway: they are not told about the hold.
  const client = await pageAs(browser, "varela");
  await client.goto("/?q=pelota");
  await client
    .getByRole("listitem")
    .filter({ hasText: "Pelota de goma" })
    .getByRole("button", { name: "Agregar" })
    .click();
  await expect(client.getByRole("link", { name: "Carrito (1)" })).toBeVisible();
  await client.goto("/checkout");
  await ready(client);
  await client.getByRole("button", { name: "Confirmar pedido" }).click();
  await expect(client).toHaveURL(/\/orders\/\d+/);
  const number = numberFromUrl(client.url().split("?")[0]);
  await client.context().close();

  await page.goto("/admin");
  await page
    .getByRole("link", { name: /Pedidos retenidos por crédito: 1/ })
    .click();
  const row = page.getByRole("row").filter({ hasText: `#${number}` });
  await expect(row).toContainText("Retenido");

  await page.goto(`/admin/orders/${number}`);
  const banner = page
    .getByRole("alert")
    .filter({ hasText: "Retenido por crédito" });
  await expect(banner).toContainText("Supera el límite");
  await expect(banner).toContainText("$ 100.000,00");
  await ready(page);

  // Held: does not move forward until it is approved.
  await page
    .getByRole("combobox", { name: "Nuevo estado" })
    .selectOption({ label: "En preparación" });
  await page
    .getByRole("combobox", { name: "Depósito para todo el pedido" })
    .selectOption({ label: "Depósito Sur" });
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(page.getByText(/retenido por crédito: aprobalo/)).toBeVisible();

  await banner.getByLabel("Comentario (opcional)").fill("Paga el viernes");
  await banner.getByRole("button", { name: "Aprobar pedido" }).click();
  await expect(page.getByText(/Aprobado por Admin Demo/)).toBeVisible();
  await expect(page.getByText("Paga el viernes").first()).toBeVisible();
  await expect(page.getByText("Retención aprobada")).toBeVisible();
});
