import { expect, test } from "@playwright/test";
import { login, numberFromUrl, pageAs, ready } from "./helpers";

// 1×1 pixel PNG and a minimal PDF: enough for the server to accept them.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

// Runs last (alphabetical order): the customer pays a new order by
// transfer, the admin rejects the first receipt and validates the second.
test("el cliente paga por transferencia y el admin revisa los comprobantes", async ({
  page,
  browser,
}) => {
  await login(page, "admin");

  await test.step("el admin carga los datos de cobro", async () => {
    await page.goto("/admin/payment-settings");
    await ready(page);
    await page.getByLabel("Banco").fill("Banco Provincia");
    await page
      .getByLabel("Titular de la cuenta")
      .fill("Onaks Distribuidora SRL");
    await page.getByLabel("CUIT del titular").fill("30-71234567-1");
    // With an incorrect check-digit CBU it does not save.
    await page.getByLabel(/^CBU/).fill("0170099220000000123450");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(/CBU inválido/)).toBeVisible();

    await page.getByLabel(/^CBU/).fill("0170099220000000123453");
    await page.getByLabel(/^Alias/).fill("onaks.cobros");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Datos guardados")).toBeVisible();
  });

  const client = await pageAs(browser, "patitas");
  let number = 0;

  await test.step("el cliente elige transferencia y adjunta un comprobante", async () => {
    await client.goto("/?q=pelota");
    await client
      .getByRole("listitem")
      .filter({ hasText: "Pelota de goma" })
      .getByRole("button", { name: "Agregar" })
      .click();
    await expect(
      client.getByRole("link", { name: "Carrito (1)" }),
    ).toBeVisible();
    await client.goto("/checkout");
    await ready(client);
    await client.getByLabel(/Local Quilmes/).check();
    await client.getByLabel("Transferencia bancaria").check();
    await expect(client.getByText("Banco Provincia")).toBeVisible();
    await expect(client.getByText("0170099220000000123453")).toBeVisible();
    await expect(client.getByText("onaks.cobros")).toBeVisible();
    await client
      .getByLabel(/^Comprobante/)
      .setInputFiles({ name: "pago.png", mimeType: "image/png", buffer: PNG });
    await client.getByRole("button", { name: "Confirmar pedido" }).click();
    await expect(client).toHaveURL(/\/orders\/\d+/);
    number = numberFromUrl(client.url().split("?")[0]);

    const section = client
      .locator("section")
      .filter({ hasText: "Comprobante de transferencia" });
    await expect(section).toContainText("En revisión");
    await expect(section).toContainText("onaks.cobros");
  });

  await test.step("el comprobante solo lo ve el admin y la empresa dueña", async () => {
    const href = await client
      .getByRole("link", { name: "Ver archivo" })
      .getAttribute("href");
    expect((await client.request.get(href!)).status()).toBe(200);
    expect((await page.request.get(href!)).status()).toBe(200);

    const other = await pageAs(browser, "varela");
    expect((await other.request.get(href!)).status()).toBe(404);
    await other.context().close();
  });

  await test.step("el admin ve el aviso y rechaza el comprobante con un motivo", async () => {
    await page.goto("/admin");
    await page
      .getByRole("link", {
        name: /Comprobantes de transferencia por validar: 1/,
      })
      .click();
    const row = page.getByRole("row").filter({ hasText: `#${number}` });
    await expect(row).toContainText("Comprobante por validar");

    await page.goto(`/admin/orders/${number}`);
    await ready(page);
    await page.getByLabel("Motivo del rechazo").fill("Monto incorrecto");
    await page.getByRole("button", { name: "Confirmar rechazo" }).click();
    await expect(page.getByText("Rechazado: Monto incorrecto")).toBeVisible();
  });

  await test.step("el cliente ve el motivo y sube otro comprobante en PDF", async () => {
    await client.goto(`/orders/${number}`);
    await ready(client);
    await expect(client.getByText("Rechazado: Monto incorrecto")).toBeVisible();
    await expect(
      client.getByText("Podés subir otro comprobante."),
    ).toBeVisible();
    await client
      .getByLabel("Comprobante (imagen o PDF, hasta 5 MB)")
      .setInputFiles({
        name: "pago.pdf",
        mimeType: "application/pdf",
        buffer: PDF,
      });
    await client.getByRole("button", { name: "Enviar comprobante" }).click();
    await expect(client.getByText("En revisión")).toBeVisible();
    // While one is under review, another cannot be uploaded.
    await expect(
      client.getByRole("button", { name: "Enviar comprobante" }),
    ).toHaveCount(0);
  });

  await test.step("el admin valida y se asienta el cobro en la cuenta", async () => {
    await page.goto(`/admin/orders/${number}`);
    await ready(page);
    await page
      .getByRole("button", { name: "Validar y registrar el cobro" })
      .click();
    await expect(page.getByText("Validado", { exact: true })).toBeVisible();

    await page.goto("/admin");
    await expect(
      page.getByRole("link", { name: /Comprobantes de transferencia/ }),
    ).toHaveCount(0);

    await client.goto(`/orders/${number}`);
    await expect(client.getByText("Validado", { exact: true })).toBeVisible();
    await client.context().close();
  });
});
