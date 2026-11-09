import { expect, test } from "@playwright/test";
import { login, pageAs, ready } from "./helpers";

// Corre después de delivery.spec: el pedido #3 (Veterinaria San Roque) ya está
// entregado con 1 bolsa de cachorro ($ 31.492,50 con IVA) y 2 de gato adulto
// ($ 21.879,00 c/u), y debe $ 25.250,50 después del cobro.
test("el admin registra una devolución y una nota por importe, y el cliente las ve", async ({
  page,
  browser,
}) => {
  await login(page, "admin");

  await test.step("devolución con una bolsa al stock y otra dada de baja", async () => {
    await page.goto("/admin/orders/3");
    await page.getByRole("link", { name: "Registrar devolución" }).click();
    await ready(page);

    await page
      .getByRole("combobox", { name: "Depósito donde ingresa lo devuelto" })
      .selectOption({ label: "Depósito Sur" });
    await page.getByLabel("Motivo", { exact: true }).fill("Producto vencido");
    await page.getByLabel("Devuelve Alimento perro cachorro 15 kg").fill("1");
    await page.getByLabel("Devuelve Alimento gato adulto 7,5 kg").fill("1");
    await page
      .getByRole("combobox", {
        name: "Qué se hace Alimento gato adulto 7,5 kg",
      })
      .selectOption({ label: "Se da de baja (vencido o roto)" });
    // 31.492,50 + 21.879,00, con el IVA del pedido.
    await expect(
      page.getByText("Se acredita en total: $ 53.371,50"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Registrar devolución" }).click();
    await expect(page).toHaveURL(/\/admin\/orders\/3$/);
    const section = page
      .locator("section")
      .filter({ hasText: "Devoluciones de este pedido" });
    await expect(section).toContainText("NC #1 · Devolución");
    await expect(section).toContainText("Producto vencido");
    await expect(section).toContainText("−$ 53.371,50");
  });

  await test.step("la cuenta pasa a saldo a favor y se puede cargar un ajuste", async () => {
    // El detalle del pedido ya enlaza a la cuenta: se va con carga completa. Con
    // clics encadenados, Next deja montada (oculta) la pantalla anterior y el
    // segundo clic puede quedar atado al link de la pantalla que se va, que
    // nunca vuelve a verse (el clic reintenta hasta el timeout del test).
    const accountHref = await page
      .getByRole("link", { name: "Ver cuenta corriente" })
      .getAttribute("href");
    await page.goto(accountHref!);
    // Debía $ 25.250,50 y se acreditan $ 53.371,50.
    await expect(
      page.getByText("Saldo a favor $ 28.121,00").first(),
    ).toBeVisible();
    await expect(page.getByText("Notas de crédito: $ 53.371,50")).toBeVisible();
    await expect(
      page.getByText("Nota de crédito #1 · Devolución"),
    ).toBeVisible();

    await ready(page);
    await page.getByLabel("Importe (con IVA)").fill("1000");
    // Next deja montada (oculta) la pantalla anterior: solo la visible.
    await page
      .getByLabel("Motivo", { exact: true })
      .filter({ visible: true })
      .fill("Bonificación por demora");
    await page.getByRole("button", { name: "Crear nota de crédito" }).click();
    const row = page
      .getByRole("row")
      .filter({ hasText: "Nota de crédito #2 · Ajuste" });
    await expect(row).toBeVisible();

    // Se anula con motivo: queda en el historial pero ya no suma.
    await row.getByText("Anular").click();
    await row.getByLabel("Motivo de la anulación").fill("Error de carga");
    await row.getByRole("button", { name: "Confirmar anulación" }).click();
    await expect(row).toContainText("Anulada: Error de carga");
    await expect(page.getByText("Notas de crédito: $ 53.371,50")).toBeVisible();
  });

  await test.step("el stock registra el ingreso de la devolución", async () => {
    await page.goto("/admin/stock");
    await page
      .getByRole("row")
      .filter({ hasText: "Alimento perro cachorro 15 kg" })
      .getByRole("link", { name: "Movimientos" })
      .click();
    const movement = page
      .getByRole("row")
      .filter({ hasText: "Devolución de cliente" });
    await expect(movement).toContainText("NC #1");
  });

  await test.step("el cliente ve la nota de crédito, sin datos internos", async () => {
    const client = await pageAs(browser, "sanroque");
    await client.goto("/orders");
    await expect(client.getByText("Tenés saldo a favor")).toBeVisible();
    await expect(client.getByText("NC #1 · Devolución · #3")).toBeVisible();
    // La anulada no aparece.
    await expect(client.getByText("NC #2")).toHaveCount(0);

    await client.goto("/orders/3");
    const section = client
      .locator("section")
      .filter({ hasText: "Devoluciones de este pedido" });
    await expect(section).toContainText("NC #1 · Devolución");
    await expect(section).toContainText("Alimento perro cachorro 15 kg");
    // El motivo y lo que se hizo con la mercadería son internos.
    await expect(section).not.toContainText("Producto vencido");
    await expect(section).not.toContainText("se da de baja");
    await client.context().close();
  });

  await test.step("los reportes descuentan lo devuelto", async () => {
    await page.goto("/admin/reports");
    // Se entregó $ 68.100 (1 cachorro + 2 de gato) y se devolvió $ 48.300: el
    // cachorro vuelve al stock (revierte venta y costo) y el gato se da de baja
    // (revierte la venta pero el costo queda: $ 27.720 y margen negativo).
    const totals = page.locator("dl").first();
    await expect(totals).toContainText("$ 19.800,00");
    await expect(totals).toContainText("$ 48.300,00");
    await expect(totals).toContainText("$ 27.720,00");
    await expect(totals).toContainText(/[-−]\s?\$\s7\.920,00/);
    await expect(totals).toContainText(/[-−]40\s?%/);
  });

  await test.step("anular la devolución saca del depósito lo que había vuelto", async () => {
    await page.goto("/admin/orders/3");
    const section = page
      .locator("section")
      .filter({ hasText: "Devoluciones de este pedido" });
    await section.getByText("Anular").click();
    await section
      .getByLabel("Motivo de la anulación")
      .fill("Devolución mal cargada");
    await section.getByRole("button", { name: "Confirmar anulación" }).click();
    await expect(section).toContainText("Anulada: Devolución mal cargada");

    // Solo lo que se había repuesto al stock se saca; lo dado de baja no se toca.
    await page.goto("/admin/stock");
    await page
      .getByRole("row")
      .filter({ hasText: "Alimento perro cachorro 15 kg" })
      .getByRole("link", { name: "Movimientos" })
      .click();
    await expect(
      page.getByRole("row").filter({ hasText: "Anulación de devolución" }),
    ).toContainText("NC #1");
  });
});
