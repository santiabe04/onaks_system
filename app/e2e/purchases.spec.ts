import { expect, test } from "@playwright/test";
import { login, ready } from "./helpers";

// Circuito de compras con el proveedor de alimentos de la demo: orden de
// compra → informe de recepción (llega de menos) → factura (sin diferencias)
// → orden de pago imputada a la factura.
test("orden de compra, recepción, factura y orden de pago", async ({
  page,
}) => {
  await login(page, "admin");
  const product = "Alimento perro cachorro 15 kg";

  await test.step("armar la orden de compra y enviarla", async () => {
    await page.goto("/admin/purchases/new");
    await page
      .getByRole("combobox", { name: "Proveedor" })
      .selectOption({ label: "Nutrición del Sur" });
    await page.getByRole("button", { name: "Crear borrador" }).click();
    await expect(page).toHaveURL(/\/admin\/purchases\/\d+$/);
    await ready(page);

    // Solo este producto (la sugerencia depende de lo que pidieron los
    // otros tests): se vacían las demás cantidades.
    for (const input of await page.getByLabel(/^Cantidad /).all()) {
      await input.fill("");
    }
    await page.getByLabel(`Cantidad ${product}`).fill("10");
    // El costo viene precargado con el último del proveedor ($ 19.950).
    await expect(page.getByLabel(`Costo neto ${product}`)).toHaveValue("19950");
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(page.getByText("Borrador guardado")).toBeVisible();

    await page.getByRole("button", { name: "Marcar como enviada" }).click();
    await expect(page.getByText("Enviada", { exact: true })).toBeVisible();
    await expect(page.getByText("$ 220.447,50")).toBeVisible();
  });

  await test.step("recibir 8 de las 10 bolsas", async () => {
    await page.getByRole("link", { name: "Cargar recepción" }).click();
    await ready(page);
    await page
      .getByRole("combobox", { name: "Depósito" })
      .selectOption({ label: "Depósito Sur" });
    await page.getByLabel("Remito del proveedor (opcional)").fill("R-0001-E2E");
    await page.getByLabel(`Llegó ${product}`).fill("8");
    await expect(page.getByText("faltan 2")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar recepción" }).click();
    await expect(page).toHaveURL(/\/admin\/receipts\/\d+$/);
    await expect(page.getByText("Confirmado")).toBeVisible();

    await page
      .getByRole("link", { name: /^#\d+$/ })
      .first()
      .click();
    await expect(page.getByText("Recibida parcial")).toBeVisible();
  });

  await test.step("cargar la factura de lo recibido", async () => {
    await page.getByRole("link", { name: "Cargar factura" }).click();
    await ready(page);
    await page.getByLabel("Punto de venta").fill("7");
    await page.getByLabel("Número", { exact: true }).fill("4321");
    // Se precarga lo recibido sin facturar (8) al costo de la OC.
    await expect(page.getByLabel(`Cantidad ${product}`)).toHaveValue("8");
    await page.getByLabel("Total de la factura").fill("176358");
    await page.getByRole("button", { name: "Cargar factura" }).click();
    await expect(page).toHaveURL(/\/admin\/invoices\/[a-z0-9]+$/);
    await expect(page.getByText("Aprobada")).toBeVisible();
    await expect(
      page.getByText("Sin diferencias: coincide con la OC y lo recibido."),
    ).toBeVisible();
  });

  await test.step("pagarla con una orden de pago", async () => {
    await page.getByRole("link", { name: "Cuenta corriente" }).click();
    await expect(page.getByText("Le debemos $ 176.358,00")).toBeVisible();
    await page.getByRole("link", { name: "Nueva orden de pago" }).click();
    await ready(page);

    await page.getByLabel("Importe").fill("176358");
    await page.getByLabel("N.º de operación").fill("TRF-E2E-1");
    await page
      .getByRole("button", { name: "Imputar a las más viejas" })
      .click();
    await expect(page.getByLabel(/^Imputar A 00007-00004321/)).toHaveValue(
      "176358",
    );
    await page.getByRole("button", { name: "Confirmar orden de pago" }).click();
    await expect(page).toHaveURL(/\/admin\/supplier-payments\/\d+$/);
    await expect(page.getByText("Vigente")).toBeVisible();

    await page.getByRole("link", { name: "Nutrición del Sur" }).click();
    await expect(page.getByText("Al día")).toBeVisible();
  });
});
