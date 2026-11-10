import { expect, test } from "@playwright/test";
import { login, numberFromUrl, ready } from "./helpers";

// Customer notices: a new order queues the "confirmed" email for
// the company's person (the test SMTP does not exist, so it stays in the queue
// with its error and can be retried) and the order offers the WhatsApp button.
test("avisos al cliente: mail en cola con reintento y botón de WhatsApp", async ({
  page,
}) => {
  await login(page, "admin");

  await test.step("el admin carga un pedido por un cliente", async () => {
    await page.goto("/admin/orders/new");
    await ready(page);
    await page.getByLabel("Buscar cliente (nombre o CUIT)").fill("san roque");
    await page
      .getByRole("combobox", { name: "Cliente" })
      .selectOption({ index: 1 });
    await expect(
      page.getByRole("radio", { name: /Consultorio/ }),
    ).toBeChecked();
    await page
      .getByLabel("Buscar producto (nombre, SKU o código de barras)")
      .fill("pelota");
    await page
      .getByRole("listitem")
      .filter({ hasText: "Pelota de goma" })
      .getByRole("button", { name: "Agregar" })
      .click();
    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await expect(page).toHaveURL(/\/admin\/orders\/\d+$/);
    expect(numberFromUrl(page.url())).toBeGreaterThan(0);
  });

  await test.step("el aviso de confirmado queda en cola con el error del envío", async () => {
    const section = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Avisos al cliente" }),
    });
    const row = section.getByRole("row").filter({ hasText: "sanroque@" });
    await expect(row).toContainText("Pendiente");
    await expect(row).toContainText("En cola");
    // The first attempt runs after responding: it reloads until it is recorded.
    await expect(async () => {
      await page.reload();
      await expect(row).toContainText(/ECONNREFUSED|connect/i);
    }).toPass();
  });

  await test.step("reintentar vuelve a intentar el envío", async () => {
    const row = page.getByRole("row").filter({ hasText: "sanroque@" });
    await row.getByRole("button", { name: "Reintentar" }).click();
    await expect(row.getByRole("button", { name: "Reintentar" })).toBeVisible();
    await expect(row).toContainText("En cola");
  });

  await test.step("el botón de WhatsApp abre un mensaje armado para el cliente", async () => {
    const link = page.getByRole("link", { name: "Avisar por WhatsApp" });
    const href = await link.getAttribute("href");
    expect(href).toContain("https://wa.me/5491155552222?text=");
    expect(decodeURIComponent(href ?? "")).toContain("Diego");
  });
});
