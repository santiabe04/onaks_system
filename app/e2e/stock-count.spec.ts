import { expect, test } from "@playwright/test";
import { login, ready } from "./helpers";

// Un conteo de inventario del Depósito Sur: se carga a ciegas por SKU (un
// código inexistente se rechaza y los escaneos del mismo producto suman), un
// admin revisa la diferencia y al aprobar queda un ajuste en el historial.
test("conteo de inventario: carga a ciegas, revisión y ajuste", async ({
  page,
}) => {
  await login(page, "admin");
  const product = "Alimento perro adulto 15 kg";
  const sku = "PER-AD-15";

  await test.step("se abre el conteo del Depósito Sur", async () => {
    await page.goto("/admin/stock/counts");
    await ready(page);
    await page
      .getByRole("combobox", { name: "Depósito" })
      .selectOption({ label: "Depósito Sur" });
    await page.getByLabel("Nota (opcional)").fill("Pasillo A");
    await page.getByRole("button", { name: "Abrir conteo" }).click();
    await expect(page).toHaveURL(/\/admin\/stock\/counts\/\d+$/);
    await expect(
      page.getByRole("heading", { name: /Conteo #\d+/ }),
    ).toBeVisible();
  });

  await test.step("no hay un segundo conteo abierto en el mismo depósito", async () => {
    const url = page.url();
    await page.goto("/admin/stock/counts");
    await ready(page);
    await page
      .getByRole("combobox", { name: "Depósito" })
      .selectOption({ label: "Depósito Sur" });
    await page.getByRole("button", { name: "Abrir conteo" }).click();
    await expect(page.getByText(/Ya hay un conteo abierto/)).toBeVisible();
    await page.goto(url);
    await ready(page);
  });

  await test.step("un código inexistente se rechaza", async () => {
    await page.getByLabel("Código de barras o SKU").fill("NO-EXISTE");
    await page.getByRole("button", { name: "Sumar", exact: true }).click();
    await expect(page.getByText(/No hay ningún producto/)).toBeVisible();
  });

  await test.step("los escaneos del mismo producto suman, sin mostrar el saldo", async () => {
    await page.getByLabel("Código de barras o SKU").fill(sku);
    await page.getByLabel("Cantidad", { exact: true }).fill("30");
    await page.getByRole("button", { name: "Sumar", exact: true }).click();
    await expect(page.getByText(`llevás contado 30`)).toBeVisible();

    await page.getByLabel("Código de barras o SKU").fill(sku.toLowerCase());
    await page.getByLabel("Cantidad", { exact: true }).fill("5");
    await page.getByRole("button", { name: "Sumar", exact: true }).click();
    await expect(page.getByText(`llevás contado 35`)).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: product });
    await expect(row).toContainText("35");
    await expect(page.getByText("Saldo al contar")).toHaveCount(0);
  });

  await test.step("la unidad entera no admite decimales", async () => {
    await page.getByLabel("Código de barras o SKU").fill(sku);
    await page.getByLabel("Cantidad", { exact: true }).fill("1,5");
    await page.getByRole("button", { name: "Sumar", exact: true }).click();
    await expect(page.getByText(/unidades enteras/)).toBeVisible();
  });

  await test.step("la revisión muestra el saldo y la diferencia", async () => {
    await page.getByRole("link", { name: "Revisar y aprobar" }).click();
    await expect(
      page.getByRole("heading", { name: /Revisar conteo #\d+/ }),
    ).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: product });
    await expect(row).toContainText("35");
    await expect(page.getByText(/1 productos contados/)).toBeVisible();
  });

  await test.step("al aprobar, el ajuste queda en el historial", async () => {
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Aprobar y ajustar el stock" })
      .click();
    await expect(page.getByText(/Aprobado el/)).toBeVisible();

    await page.goto("/admin/stock");
    await page
      .getByRole("row")
      .filter({ hasText: product })
      .getByRole("link")
      .first()
      .click();
    await expect(page.getByText(/Conteo #\d+/).first()).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: /Conteo #\d+/ }),
    ).toContainText("35");
  });
});
