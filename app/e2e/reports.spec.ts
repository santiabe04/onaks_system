import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Corre después de delivery.spec: el pedido #3 (Veterinaria San Roque) ya está
// entregado con faltante. Los costos de la demo son el 70 % del precio neto.
test("reporte de ventas y margen del mes, por cliente y sin movimiento", async ({
  page,
}) => {
  await login(page, "admin");
  await page.goto("/admin/reports?tab=customers");

  // Entregados del mes: solo el #3.
  const totals = page.locator("dl").first();
  await expect(totals).toContainText("$ 68.100,00");
  await expect(totals).toContainText("$ 20.430,00");
  await expect(totals).toContainText("30%");
  await expect(
    page.getByRole("row").filter({ hasText: "Veterinaria San Roque" }),
  ).toContainText("$ 68.100,00");

  // Confirmados: entran también los pendientes.
  await page
    .getByRole("combobox", { name: "Qué cuenta como venta" })
    .selectOption("confirmed");
  await page.getByRole("button", { name: "Ver" }).click();
  await expect(page).toHaveURL(/basis=confirmed/);
  await expect(
    page.getByRole("row").filter({ hasText: "Mascotas Varela" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Sin movimiento" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Rascador para gato" }),
  ).toBeVisible();

  const csv = await page.request.get(
    `/admin/reports/export${new URL(page.url()).search}`,
  );
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("Rascador para gato;JUG-RASC");
});
