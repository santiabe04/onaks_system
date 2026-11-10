import { expect, test } from "@playwright/test";
import { login, ready } from "./helpers";

/** YYYY-MM-DD a `days` días de hoy (UTC alcanza: los márgenes son de semanas). */
function dayFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Un producto que controla vencimiento se recibe repartido en dos lotes (uno ya
// vencido); un pedido sale primero del que vence antes, el picking lo muestra y
// permite cambiarlo, un ingreso a mano pide lote y el listado y el aviso lo reflejan.
test("lotes y vencimientos: recepción, salida FEFO y avisos", async ({
  page,
}) => {
  await login(page, "admin");
  const product = "Snack gato atún 60 g";

  await test.step("el producto pasa a controlar vencimiento", async () => {
    await page.goto("/admin/products");
    await page
      .getByRole("row")
      .filter({ hasText: product })
      .getByRole("link", { name: "Editar" })
      .click();
    await ready(page);
    await page.getByLabel("Controla vencimiento").check();
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);
  });

  await test.step("orden de compra de 10 unidades", async () => {
    await page.goto("/admin/purchases/new");
    await page
      .getByRole("combobox", { name: "Proveedor" })
      .selectOption({ label: "Nutrición del Sur" });
    await page.getByRole("button", { name: "Crear borrador" }).click();
    await expect(page).toHaveURL(/\/admin\/purchases\/\d+$/);
    await ready(page);
    for (const input of await page.getByLabel(/^Cantidad /).all()) {
      await input.fill("");
    }
    await page.getByLabel(`Cantidad ${product}`).fill("10");
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(page.getByText("Borrador guardado")).toBeVisible();
    await page.getByRole("button", { name: "Marcar como enviada" }).click();
    await expect(page.getByText("Enviada", { exact: true })).toBeVisible();
  });

  await test.step("llega todo junto, repartido en un lote vencido y uno nuevo", async () => {
    await page.getByRole("link", { name: "Cargar recepción" }).click();
    await ready(page);
    await page
      .getByRole("combobox", { name: "Depósito" })
      .selectOption({ label: "Depósito Sur" });
    await page.getByLabel(`Llegó ${product}`).fill("10");
    // Sin lote ni fecha no se puede confirmar.
    await page.getByRole("button", { name: "Confirmar recepción" }).click();
    await expect(page.getByText(/Cargá el lote/)).toBeVisible();

    await page.getByRole("button", { name: "+ Otro lote" }).click();
    await page.getByLabel(`Lote 1 ${product}`, { exact: true }).fill("L-VIEJO");
    await page.getByLabel(`Vencimiento 1 ${product}`).fill(dayFromNow(-10));
    await page.getByLabel(`Cantidad del lote 1 ${product}`).fill("4");
    await page.getByLabel(`Lote 2 ${product}`, { exact: true }).fill("L-NUEVO");
    await page.getByLabel(`Vencimiento 2 ${product}`).fill(dayFromNow(400));
    // Los lotes tienen que sumar lo que llegó.
    await page.getByLabel(`Cantidad del lote 2 ${product}`).fill("5");
    await page.getByRole("button", { name: "Confirmar recepción" }).click();
    await expect(page.getByText(/tienen que sumar/)).toBeVisible();
    await page.getByLabel(`Cantidad del lote 2 ${product}`).fill("6");
    await page.getByRole("button", { name: "Confirmar recepción" }).click();
    await expect(page).toHaveURL(/\/admin\/receipts\/\d+$/);
    await expect(page.getByText("L-VIEJO · 4")).toBeVisible();
    await expect(page.getByText("L-NUEVO · 6")).toBeVisible();
  });

  await test.step("el listado y el dashboard avisan del lote vencido", async () => {
    await page.goto("/admin");
    await page.getByRole("link", { name: /Lotes vencidos: 1/ }).click();
    await expect(page).toHaveURL(/\/admin\/stock\/lots\?status=expired/);
    const row = page.getByRole("row").filter({ hasText: "L-VIEJO" });
    await expect(row).toContainText("Vencido");
    await expect(row).toContainText("4");
    await expect(page.getByText("L-NUEVO")).toHaveCount(0);
  });

  let orderNumber = 0;
  await test.step("un pedido de 5 unidades sale del lote que vence antes", async () => {
    await page.goto("/admin/orders/new");
    await ready(page);
    await page.getByLabel("Buscar cliente (nombre o CUIT)").fill("patitas");
    await page
      .getByRole("combobox", { name: "Cliente" })
      .selectOption({ index: 1 });
    await page.getByRole("radio", { name: /Local Quilmes/ }).check();
    await page
      .getByLabel("Buscar producto (nombre, SKU o código de barras)")
      .fill("snack gato");
    await page
      .getByRole("listitem")
      .filter({ hasText: product })
      .getByRole("button", { name: "Agregar" })
      .click();
    await page.getByLabel(`Cantidad ${product}`).fill("5");
    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await expect(page).toHaveURL(/\/admin\/orders\/\d+$/);
    orderNumber = Number(page.url().split("/").pop());

    await page.goto("/admin/orders/list");
    await page.getByLabel(`Elegir el pedido #${orderNumber}`).check();
    await page
      .getByText("Armar lista de picking con los seleccionados")
      .click();
    await page
      .getByRole("combobox", { name: "Depósito", exact: true })
      .selectOption({ label: "Depósito Sur" });
    await page.getByRole("button", { name: "Armar lista" }).click();
    await expect(page).toHaveURL(/\/admin\/picking\/\d+$/);
    await ready(page);
    // La lista dice de qué lote sacar: 4 del vencido y 1 del nuevo.
    await expect(
      page.getByText(/L-VIEJO \(vence .*\): 4/).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/L-NUEVO \(vence .*\): 1/).first(),
    ).toBeVisible();
  });

  await test.step("el admin cambia 2 unidades al lote nuevo porque es el que hay en el estante", async () => {
    await page.getByText("Cambiar lote").first().click();
    await page
      .getByRole("combobox", { name: "Sacar del lote" })
      .selectOption({ index: 1 });
    await page
      .getByRole("combobox", { name: "Tomar del lote" })
      .selectOption({ index: 1 });
    await page.getByLabel("Cantidad", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Cambiar lote" }).last().click();
    await expect(
      page.getByText(/L-VIEJO \(vence .*\): 2/).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/L-NUEVO \(vence .*\): 3/).first(),
    ).toBeVisible();
  });

  await test.step("un ingreso a mano de un producto con vencimiento pide lote", async () => {
    await page.goto("/admin/stock/new");
    await ready(page);
    await page
      .getByRole("combobox", { name: "Producto" })
      .selectOption({ label: `${product} (SNK-GAT-60)` });
    await page
      .getByRole("combobox", { name: "Depósito" })
      .selectOption({ label: "Depósito Sur" });
    await page.getByLabel(/^Cantidad/).fill("2");
    await page.getByRole("button", { name: "Registrar" }).click();
    await expect(page.getByText(/controla vencimiento/)).toBeVisible();
    // React resetea el form un instante después del error: se espera antes de tipear.
    await ready(page);
    const expiry = page.getByRole("textbox", {
      name: "Vencimiento",
      exact: true,
    });
    // Si el reset llega después de tipear, se vuelve a tipear hasta que quede.
    await expect(async () => {
      await page.getByLabel(/^Lote/).fill("L-MANUAL");
      await expiry.fill(dayFromNow(200));
      await expect(page.getByLabel(/^Lote/)).toHaveValue("L-MANUAL");
      await expect(expiry).toHaveValue(dayFromNow(200));
    }).toPass();
    await page.getByRole("button", { name: "Registrar" }).click();
    await page.waitForURL((url) => !url.pathname.endsWith("/new"));

    await page.goto("/admin/stock/lots");
    // Lo que quedó de cada lote: 2 del vencido, 3 del nuevo y 2 del manual.
    for (const [lot, quantity] of [
      ["L-VIEJO", "2"],
      ["L-NUEVO", "3"],
      ["L-MANUAL", "2"],
    ]) {
      await expect(
        page.getByRole("row").filter({ hasText: lot }),
      ).toContainText(quantity);
    }
  });

  await test.step("el historial del producto muestra de qué lote salió cada tramo", async () => {
    await page.getByRole("link", { name: product }).first().click();
    await expect(page.getByText("Lote L-VIEJO").first()).toBeVisible();
    await expect(page.getByText("Lote L-NUEVO").first()).toBeVisible();
    await expect(page.getByText("Lote L-MANUAL").first()).toBeVisible();
  });
});
