import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Runs after delivery.spec (alphabetical): order #3 of Veterinaria San
// Roque is already delivered with 1 puppy bag and 2 adult cat bags, and the
// admin had earlier entered an order with a rubber ball. It uses San Roque
// because no other spec depends on its cart.
test("favoritos de la empresa, lo que más pidió y repetir un pedido", async ({
  page,
}) => {
  await login(page, "sanroque");

  await test.step("la portada muestra lo que más pidió", async () => {
    await page.goto("/");
    const section = page
      .locator("section")
      .filter({ hasText: "Lo que más pedís" });
    await expect(section).toContainText("Pelota de goma");
    await expect(section).toContainText("Alimento perro cachorro 15 kg");
  });

  await test.step("marcar un favorito con el corazón", async () => {
    await page.goto("/?q=pelota");
    const heart = page.getByRole("button", { name: "Marcar como favorito" });
    // The heart changes instantly: wait until the server saves it.
    const saved = page.waitForResponse((r) => r.request().method() === "POST");
    await heart.click();
    await saved;
    await expect(
      page.getByRole("button", { name: "Quitar de favoritos" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  await test.step("el filtro muestra solo los favoritos y los suma al carrito", async () => {
    await page.goto("/?favorites=1");
    await expect(page.getByText("Pelota de goma").first()).toBeVisible();
    // With the filter, the most-ordered section is not shown.
    await expect(page.getByText("Lo que más pedís")).toHaveCount(0);

    await page
      .getByRole("button", { name: "Agregar todos al carrito" })
      .click();
    await expect(
      page.getByText("Productos sumados al carrito: 1"),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Carrito (1)" })).toBeVisible();

    // A second time does not add extra: it is already in the cart.
    await page
      .getByRole("button", { name: "Agregar todos al carrito" })
      .click();
    await expect(
      page.getByText("Todos tus favoritos ya están en el carrito."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Carrito (1)" })).toBeVisible();
  });

  await test.step("repetir el pedido #3 con los precios de hoy", async () => {
    await page.goto("/orders");
    await page
      .getByRole("row")
      .filter({ hasText: "#3" })
      .getByRole("button", { name: "Repetir pedido" })
      .click();
    await expect(page).toHaveURL(/\/cart\?repeated=2&omitted=0&from=3/);
    await expect(
      page.getByText("Productos sumados al carrito desde el pedido #3: 2"),
    ).toBeVisible();
    await expect(page.getByText("Alimento perro cachorro 15 kg")).toBeVisible();
    await expect(page.getByText("Alimento gato adulto 7,5 kg")).toBeVisible();
    // The ball was already there and the two new products are added.
    await expect(page.getByRole("link", { name: "Carrito (3)" })).toBeVisible();

    // Also from the order detail: the quantities add up.
    await page.goto("/orders/3");
    await page.getByRole("button", { name: "Repetir pedido" }).click();
    await expect(
      page.getByText("Productos sumados al carrito desde el pedido #3: 2"),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Carrito (3)" })).toBeVisible();
  });

  await test.step("quitar el favorito", async () => {
    await page.goto("/?q=pelota");
    const removed = page.waitForResponse(
      (r) => r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Quitar de favoritos" }).click();
    await removed;
    await expect(
      page.getByRole("button", { name: "Marcar como favorito" }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.goto("/?favorites=1");
    await expect(page.getByText(/Todavía no marcaste favoritos/)).toBeVisible();
  });
});
