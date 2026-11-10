import { expect, test } from "@playwright/test";
import { login, numberFromUrl, pageAs, ready } from "./helpers";

// 2×2 PNG for the "receipt photo" (the app converts it to WebP with sharp).
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==",
  "base64",
);

// Order #3 of the demo (Veterinaria San Roque): 2 bags of puppy dog food
// and 3 of adult cat food. It goes through picking (one bag is
// broken), a route sheet, a partial delivery with payment and the closing with the cash count.
test("picking, hoja de ruta, parada con entrega parcial y cierre", async ({
  page,
  browser,
}) => {
  await login(page, "admin");

  let pickingNumber = 0;
  await test.step("armar el picking con el pedido #3", async () => {
    await page.goto("/admin/orders/list");
    await page.getByLabel("Elegir el pedido #3").check();
    await page
      .getByText("Armar lista de picking con los seleccionados")
      .click();
    await page
      .getByRole("combobox", { name: "Depósito", exact: true })
      .selectOption({ label: "Depósito Sur" });
    await page.getByRole("button", { name: "Armar lista" }).click();
    await expect(page).toHaveURL(/\/admin\/picking\/\d+$/);
    pickingNumber = numberFromUrl(page.url());
    await ready(page);
    await expect(page.getByText("Abierta")).toBeVisible();
  });

  await test.step("confirmar con una bolsa rota", async () => {
    const cat = "#3 Alimento gato adulto 7,5 kg";
    await page.getByLabel(`Preparado ${cat}`).fill("2");
    await page
      .getByRole("combobox", { name: `Motivo si falta ${cat}` })
      .selectOption({ label: "Roto o vencido (baja)" });
    await page.getByLabel("Preparó (opcional)").fill("Depósito e2e");
    await page.getByRole("button", { name: "Confirmar preparación" }).click();
    await expect(page.getByText("Preparada", { exact: true })).toBeVisible();

    await page.goto("/admin/orders/3");
    await expect(page.getByText("Listo para despachar").first()).toBeVisible();
    await expect(page.getByText("$ 106.743,00").first()).toBeVisible();
  });

  let sheetNumber = 0;
  await test.step("armar la hoja de ruta y salir", async () => {
    await page.goto("/admin/orders");
    await page.getByLabel("Elegir el pedido #3").check();
    await page.getByText("Armar hoja de ruta con los seleccionados").click();
    await page
      .getByRole("combobox", { name: "Vehículo", exact: true })
      .selectOption({ index: 1 });
    await page.getByRole("button", { name: "Crear hoja de ruta" }).click();
    await expect(page).toHaveURL(/\/admin\/routes\/\d+$/);
    sheetNumber = numberFromUrl(page.url());

    await page.getByRole("button", { name: "Salir a repartir" }).click();
    await expect(page.getByText("En reparto").first()).toBeVisible();
  });

  await test.step("el repartidor carga la parada desde el celular", async () => {
    const driver = await pageAs(browser, "reparto");
    await driver.setViewportSize({ width: 390, height: 844 });
    await driver
      .getByRole("link", { name: new RegExp(`Hoja #${sheetNumber}`) })
      .click();
    await driver.getByRole("link", { name: /Veterinaria San Roque/ }).click();

    await driver.getByText("✓ Entregado").click();
    await driver.getByLabel("Aclaración (nombre)").fill("Diego Fernández");
    await driver
      .getByLabel("Foto del remito (opcional si firmó)")
      .setInputFiles({
        name: "remito.png",
        mimeType: "image/png",
        buffer: PHOTO,
      });

    // Receives only 1 of the 2 puppy bags: the other one goes back to the warehouse.
    await driver.getByLabel("Entrega parcial").check();
    const puppy = driver.getByRole("group", {
      name: "Alimento perro cachorro 15 kg",
    });
    await puppy.getByLabel(/Entregado \(de/).fill("1");
    await puppy
      .getByRole("combobox", { name: "Motivo" })
      .selectOption({ label: "Vuelve al depósito (rechazado, sobrante)" });

    await driver.getByLabel("Monto cobrado").fill("50000");
    await driver.getByRole("button", { name: "Guardar parada" }).click();
    // Goes back to the sheet with the stop loaded.
    await expect(driver).toHaveURL(`/delivery/${sheetNumber}`);
    await expect(driver.getByText("1 de 1 paradas cargadas")).toBeVisible();
    await expect(
      driver.getByRole("link", { name: /Veterinaria San Roque/ }),
    ).toContainText("Entregado");
    await driver.context().close();
  });

  await test.step("cerrar la hoja con la rendición", async () => {
    await page.goto(`/admin/routes/${sheetNumber}`);
    await page.getByLabel("Efectivo que entregó el repartidor").fill("50000");
    await page.getByRole("button", { name: "Cerrar la hoja" }).click();
    await expect(page.getByText(/Cerrada el/)).toBeVisible();

    // The order is delivered and adjusted to what the customer received.
    await page.goto("/admin/orders/3");
    await expect(page.getByText("Entregado").first()).toBeVisible();
    await expect(page.getByText("$ 75.250,50").first()).toBeVisible();
  });

  expect(pickingNumber).toBeGreaterThan(0);
});
