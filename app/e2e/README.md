# Tests de punta a punta (Playwright)

Recorren la app como lo haría una persona, con Chromium, contra la app compilada y una base con la
**demo del seed** (`SEED_DEMO=true`):

| Archivo               | Circuito                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `shop.spec.ts`        | El cliente arma el carrito, confirma el pedido y lo ve en Mis pedidos                       |
| `delivery.spec.ts`    | Picking (con faltante), hoja de ruta, parada desde el celular con entrega parcial, y cierre |
| `purchases.spec.ts`   | Orden de compra, recepción de menos, factura sin diferencias y orden de pago                |
| `permissions.spec.ts` | Cliente y repartidor no entran al admin; un cliente no ve pedidos de otra empresa           |

Corren de a uno y sobre una base **nueva**: dependen de los números de pedido de la demo (#1 a #4) y
cada circuito deja datos. En el CI los corre el job `e2e`.

## Correrlos localmente

Con un Postgres andando (por ejemplo el de `docker compose up -d db`), en `app/`:

```bash
# 1. Base nueva con migraciones y demo (borra lo que haya en esa base).
export DATABASE_URL="postgresql://onaks:admin@localhost:5432/onaks_e2e?schema=public"
npx prisma migrate reset --force
SEED_DEMO=true npx prisma db seed

# 2. Compilar y correr (Playwright levanta `npm run start` solo).
npm run build
SESSION_SECRET=una-clave-de-al-menos-32-caracteres APP_LOCALE=es npm run test:e2e
```

La primera vez hay que bajar el navegador: `npx playwright install chromium`.

- Para correrlos contra una app ya levantada: `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`.
- Para verlos en acción: `npm run test:e2e -- --headed` o `--ui`.
- Si falla, el reporte con capturas y la traza queda en `playwright-report/` (`npx playwright show-report`).

## Al escribir uno nuevo

- Selectores por rol y texto visible (`getByRole`, `getByLabel`, `getByText`), como los usaría una
  persona. Para un `<select>`, `getByRole("combobox", { name })`: el `getByLabel` de un label que envuelve
  al select incluye el texto de las opciones.
- Antes de tocar un form con campos controlados, `await ready(page)` (`helpers.ts`): si no, la
  hidratación de React pisa lo que se tipeó.
- Usuarios: `login(page, "admin" | "reparto" | "patitas" | "sanroque" | "varela")`; para dos usuarios a
  la vez, `pageAs(browser, ...)` abre otro contexto con su propia sesión.
