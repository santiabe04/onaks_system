import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Corre después de delivery.spec (alfabético): el pedido #3 de Veterinaria San
// Roque ya está entregado con 1 bolsa de cachorro y 2 de gato adulto, y el
// admin le cargó antes un pedido con una pelota de goma. Usa a San Roque
// porque ningún otro spec depende de su carrito.
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
    // El corazón cambia al instante: esperar a que el server lo guarde.
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
    // Con el filtro no se muestra la sección de más pedidos.
    await expect(page.getByText("Lo que más pedís")).toHaveCount(0);

    await page
      .getByRole("button", { name: "Agregar todos al carrito" })
      .click();
    await expect(
      page.getByText("Productos sumados al carrito: 1"),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Carrito (1)" })).toBeVisible();

    // Una segunda vez no suma de más: ya está en el carrito.
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
    // La pelota ya estaba y los dos productos nuevos se suman.
    await expect(page.getByRole("link", { name: "Carrito (3)" })).toBeVisible();

    // También desde el detalle del pedido: las cantidades se acumulan.
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
