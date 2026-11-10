# Tests de punta a punta (Playwright)

> English version: [`README.en.md`](README.en.md). Las dos versiones se mantienen al día juntas.

Recorren la app como lo haría una persona, con Chromium, contra la app compilada y una base con la
**demo del seed** (`SEED_DEMO=true`):

| Archivo               | Circuito                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `admin-order.spec.ts` | El admin carga un pedido por un cliente y el cliente lo ve como "La distribuidora"                   |
| `credit.spec.ts`      | Un pedido que supera el límite de crédito queda retenido, no avanza y el admin lo aprueba            |
| `delivery.spec.ts`    | Picking (con faltante), hoja de ruta, parada desde el celular con entrega parcial, y cierre          |
| `permissions.spec.ts` | Cliente y repartidor no entran al admin; un cliente no ve pedidos de otra empresa                    |
| `price-lists.spec.ts` | El admin arma una lista de precios con un precio fijo, se la asigna a un cliente y éste ve su precio |
| `purchases.spec.ts`   | Orden de compra, recepción de menos, factura sin diferencias y orden de pago                         |
| `reports.spec.ts`     | Reporte de ventas y margen del mes, por cliente y sin movimiento, y su CSV                           |
| `favorites.spec.ts`   | Favoritos de la empresa, lo que más pidió y repetir un pedido                                        |
| `returns.spec.ts`     | Devolución del pedido entregado, ajuste por importe, reportes, anulaciones y lo que ve el cliente    |
| `shop.spec.ts`        | El cliente arma el carrito, confirma el pedido y lo ve en Mis pedidos                                |
| `lots.spec.ts`        | Producto con vencimiento: recepción en dos lotes, salida FEFO, cambio de lote en el picking y avisos |
| `notices.spec.ts`     | Aviso por mail en cola con reintento (SMTP a un puerto cerrado) y botón de WhatsApp                  |
| `stock-count.spec.ts` | Conteo de un depósito: escaneos que suman, revisión con diferencia y ajuste al aprobar               |
| `transfer.spec.ts`    | Pedido por transferencia con comprobante: el admin rechaza el primero y valida el segundo            |

Corren de a uno y sobre una base **nueva**: dependen de los números de pedido de la demo (#1 a #4) y
cada circuito deja datos. Se ejecutan en orden alfabético y alguno depende del anterior (`reports` usa el
pedido #3 que entrega `delivery`). En el CI los corre el job `e2e`.

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

El servidor que levanta Playwright (`playwright.config.ts`) lleva un SMTP a un puerto cerrado
(`SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM`): así los avisos por mail se encolan y fallan sin mandar nada, y
`notices.spec.ts` los ve en el pedido. Si corrés contra una app ya levantada (`E2E_BASE_URL`), tiene que
tener ese mismo SMTP.

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
