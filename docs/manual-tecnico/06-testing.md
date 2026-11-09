# 6. Testing

Hay dos niveles, más las verificaciones estáticas:

| Nivel                  | Herramienta                  | Qué prueba                                                                         | Dónde              | Cuánto tarda |
| ---------------------- | ---------------------------- | ---------------------------------------------------------------------------------- | ------------------ | ------------ |
| Estático               | TypeScript, ESLint, Prettier | Tipos, estilo, errores comunes                                                     | todo `app/`        | segundos     |
| Unitario               | Vitest                       | Lógica pura de `lib/`: cuentas, validaciones, reglas                               | `src/**/*.test.ts` | ~1 s         |
| De punta a punta (e2e) | Playwright                   | Circuitos completos con un navegador real, la app compilada y una base con la demo | `e2e/`             | ~40 s        |

La filosofía: **la lógica de negocio vive en funciones puras y se prueba a fondo con tests unitarios
baratos; los e2e cubren los circuitos de punta a punta** (que las piezas se hablan bien, los permisos y
las transacciones). No hay tests de integración de Server Actions sueltas ni mocks de Prisma: lo que toca
la base se prueba en el e2e.

## Antes de abrir un PR

Desde `app/`, lo mismo que corre el CI:

```bash
npm run format:check && npm run lint && npm run typecheck && npm test
npm run build            # si tocaste rutas, config o algo del servidor
npm run test:e2e         # si tocaste un circuito (ver "Correrlos" abajo)
```

El hook de pre-commit ya corre `format:check` y `lint`, pero solo cuando el commit toca `app/`.

## Tests unitarios (Vitest)

Configuración: `vitest.config.ts`, entorno `node`, incluye `src/**/*.test.ts`, con el alias `@` →
`src/`. Hay ~50 archivos y ~380 tests. Se corren con `npm test` (una pasada) o, mientras desarrollás,
`npx vitest` (modo watch) o `npx vitest run src/lib/credit.test.ts` (un archivo).

### Qué se testea y qué no

- **Se testea** todo lo de `lib/` que sea **puro**: cuentas de plata y cantidades (`cart`, `price`,
  `customer-price`, `account`, `credit`, `sales-report`), reglas de estados (`sale-state`), parseo y
  validación de forms (`tax-rate`, `customer`, `price-list`, `admin-order`, `checkout`, ...), orden y
  búsqueda (`picking`, `catalog`), filtros desde la URL (`order-filters`, `order-period`), la sesión
  (`session-token`), el CSV, el bloqueo de login, los permisos (`permissions`).
- **No se testean unitariamente** los archivos `*-queries.ts` y `*-ledger.ts` (hablan con Prisma y están
  marcados `server-only`), ni las páginas y actions. Eso lo cubre el e2e. Por eso conviene **sacar la
  decisión a una función pura** y dejar el archivo de servidor lo más fino posible.

### Cómo se escriben

El `*.test.ts` va **al lado** del archivo que prueba. Estilo del proyecto:

```ts
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { percentToFraction, validateTaxRateForm } from "./tax-rate";

const t = es.taxRates.errors; // los mensajes salen del diccionario real

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("percentToFraction", () => {
  it("convierte porcentajes con coma o punto", () => {
    expect(percentToFraction("10,5")).toBe("0.1050");
  });

  it("rechaza lo que no entra en la columna", () => {
    expect(percentToFraction("100,01")).toBeNull();
  });
});
```

Convenciones:

- Descripciones **en español, como una frase** (`it("retiene si lo que debe con el pedido nuevo supera el
límite")`): se lee como una especificación.
- **Casos de borde de plata**: redondeo (mitad hacia arriba), cantidades con 3 decimales, el signo, el
  cero, el máximo de la columna. Los resultados se comparan como **string** (`"1234.50"`), nunca con
  `toBeCloseTo`: si un monto necesita tolerancia, hay un bug.
- **Los tests de validación usan el diccionario real** (`es.xxx.errors`), así si cambia un mensaje o se
  renombra una clave, el test lo nota.
- **Datos de ejemplo del dominio**: una distribuidora de alimentos y productos para mascotas (alimento
  de perro de 15 kg, piedras sanitarias, pelota de goma, "Pet Shop Patitas"). Usá esos mismos nombres
  para que los tests se lean parecido.
- Para las funciones que dependen de la hora, **recibir `now` por parámetro** (con valor por defecto
  `new Date()`) y fijarlo en el test. La única excepción es el vencimiento de la sesión
  (`session-token.test.ts`), que usa `vi.useFakeTimers()` porque el vencimiento lo resuelve la librería `jose`.
- Sin mocks: si una función necesita mockear algo, es señal de que mezcla lógica y acceso a datos.

## Tests de punta a punta (Playwright)

Recorren la app como una persona, con **Chromium**, contra la app **compilada** (`next start`) y una
**base nueva con la demo del seed**. Cada archivo es un circuito:

| Archivo               | Circuito                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin-order.spec.ts` | El admin carga un pedido por un cliente (con su lista de precios) y el cliente lo ve como "La distribuidora"                                                |
| `credit.spec.ts`      | Un cliente supera el límite de crédito: el pedido queda retenido, no avanza y el admin lo aprueba                                                           |
| `delivery.spec.ts`    | Picking con faltante, hoja de ruta, parada desde el celular con entrega parcial y cobro, y cierre                                                           |
| `permissions.spec.ts` | Cliente y repartidor no entran al admin; un cliente no ve pedidos de otra empresa; sin sesión, al login                                                     |
| `price-lists.spec.ts` | El admin arma una lista con un precio fijo, se la asigna a un cliente con descuento y el cliente ve su precio                                               |
| `purchases.spec.ts`   | Orden de compra, recepción de menos, factura sin diferencias y orden de pago                                                                                |
| `reports.spec.ts`     | Reporte de ventas y margen del mes, por cliente, "sin movimiento" y CSV                                                                                     |
| `favorites.spec.ts`   | Favoritos de la empresa con el corazón y el filtro, "agregar todos", lo que más pidió y repetir un pedido (de la lista y del detalle)                       |
| `returns.spec.ts`     | Devolución del pedido entregado (una bolsa al stock y otra de baja), ajuste por importe, lo que descuentan los reportes, anulaciones y lo que ve el cliente |
| `shop.spec.ts`        | El cliente arma el carrito, confirma el pedido y lo ve en "Mis pedidos"                                                                                     |

### Reglas del juego

- **Corren de a uno** (`workers: 1`, sin paralelismo) y **sobre una base nueva**: comparten la base y
  cada circuito deja datos. Dependen de los pedidos de la demo (**#1 a #4**) y de los usuarios
  `admin`, `reparto`, `patitas`, `sanroque`, `varela` (`demo1234`).
- **El orden importa**: Playwright corre los archivos en orden alfabético. `reports.spec.ts` espera que
  `delivery.spec.ts` ya haya entregado el pedido #3 (la venta del mes sale de ahí), `returns.spec.ts` también
  parte del #3 ya entregado y con su cobro, y `credit.spec.ts` le pone un límite a Mascotas Varela. Si agregás un spec, pensá qué datos deja y qué datos necesita.
- **Un spec que modifica algo de la demo** (un límite, una lista) no lo deshace: asume una base nueva por
  corrida.

### Correrlos localmente

Con un Postgres andando (por ejemplo `docker compose up -d db`), en `app/`:

```bash
# 1. Base nueva con migraciones y demo (borra lo que haya en esa base).
export DATABASE_URL="postgresql://onaks:admin@localhost:5432/onaks_e2e?schema=public"
npx prisma migrate reset --force
SEED_DEMO=true npx prisma db seed

# 2. Compilar y correr (Playwright levanta `npm run start` solo).
npm run build
SESSION_SECRET=una-clave-de-al-menos-32-caracteres APP_LOCALE=es npm run test:e2e
```

La primera vez: `npx playwright install chromium`. Variantes:

- Contra una app ya levantada: `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`.
- Ver el navegador: `npm run test:e2e -- --headed` o `--ui`. Un solo archivo:
  `npm run test:e2e -- e2e/credit.spec.ts`.
- Si falla, el reporte con capturas y la traza queda en `playwright-report/` y `test-results/`
  (`npx playwright show-report`).
- **Antes de repetir una corrida completa, recrear la base**: los circuitos no son repetibles sobre la
  misma base (un pedido ya entregado, un límite ya puesto).

### Cómo se escribe uno nuevo

La configuración está en `playwright.config.ts` (locale `es-AR`, zona horaria de Argentina, traza y
captura al fallar, un reintento solo en el CI). Los helpers, en `e2e/helpers.ts`:

| Helper                     | Para qué                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `login(page, usuario)`     | Entra con el form de login como un usuario de la demo.                                            |
| `pageAs(browser, usuario)` | Otra página con su propio contexto y sesión: para probar dos usuarios a la vez (admin y cliente). |
| `numberFromUrl(url)`       | El número de pedido de una URL (`/orders/12`).                                                    |
| `ready(page)`              | Espera a `networkidle`: **obligatorio antes de tocar un form con campos controlados**.            |

Reglas que evitan los tests inestables:

1. **Selectores por rol y texto visible** (`getByRole`, `getByLabel`, `getByText`), como los usaría una
   persona. Nada de clases CSS ni `data-testid`.
2. Para un `<select>`: `getByRole("combobox", { name })`. `getByLabel` sobre un label que envuelve al
   select incluye el texto de las opciones y no encuentra lo que buscás.
3. **`await ready(page)` antes de escribir** en forms con estado controlado (los que usan
   `useFieldValues`): si no, la hidratación de React pisa lo tipeado.
4. **El `$` y el número van separados por un espacio duro** (U+00A0) en el formato de plata. Para matchear
   texto con regex, usá `\s` entre `$` y el monto (`/de \$\s100\.000,00/`); con `toContainText("$ 1.633,50")`
   funciona porque Playwright normaliza los espacios.
5. Un `role="alert"` **reemplaza** el rol de un link: si un `<Link>` lleva `role="alert"`, ya no se
   encuentra con `getByRole("link")`.
6. **Con una UI optimista** (el corazón de favoritos cambia al instante), esperar la respuesta del server
   antes de navegar o el request se cancela: `const saved = page.waitForResponse((r) => r.request().method()
=== "POST"); await boton.click(); await saved;`.
7. **Navegación entre pantallas.** Next deja montada, oculta, la pantalla anterior, y un clic que
   Playwright resolvió sobre un link de la pantalla que se va **se queda con ese elemento**: si la
   navegación se completa en medio del clic, reintenta hasta el timeout del test (60 s) con "element is
   not visible". Pasa cuando el próximo paso busca algo que existe en las dos pantallas (por ejemplo "Ver
   cuenta corriente", que está en el pedido y en el cliente). Para encadenar pantallas, navegá con
   `page.goto(href)` (carga completa, sin pantallas ocultas) o esperá primero algo **único de la pantalla
   nueva** (`toHaveURL` y un encabezado) antes del siguiente clic.
8. Las verificaciones usan los números de la demo; si cambiás la demo, revisá los specs.
9. Cada spec cuenta **un circuito**, con comentarios que explican qué dato de la demo usa y por qué.

## Integración continua

Los PR a `main` corren, en este orden de dependencia (ver el [capítulo 3](03-produccion.md#github-actions)):

1. `conventional-commits`: commitlint sobre commits y título del PR.
2. `app-checks`: `format:check`, `lint`, `typecheck`, `test`, **migraciones + seed** contra un Postgres 18,
   **chequeo de drift** del schema y `build`.
3. `docker`: valida el compose de producción y los Caddyfile, construye las imágenes, levanta el stack y
   espera el health check.
4. `e2e`: Postgres 18 como servicio, migraciones y seed **con la demo**, `build`, `playwright install
--with-deps chromium` y `npm run test:e2e`. Si falla, sube `playwright-report/` y `test-results/` como
   artefacto (7 días).
5. `ci-ok`: el único check **requerido**; falla si cualquiera de los anteriores falló.

Los jobs de `app/` solo corren si el PR toca `app/`. Un PR de documentación pasa solo por los dos
chequeos que no dependen del código.

## Probar a mano

Para validar un cambio de UI, además de los tests:

- Levantar la demo (`SEED_DEMO=true`) e iniciar sesión con los usuarios `*@demo.onaks.local`.
- Probar **en celular** (ancho 375 px) las pantallas de cliente y de reparto, **en los dos temas**
  (claro y oscuro) y **en los dos idiomas** (`APP_LOCALE`).
- Imprimir (o la vista previa de impresión) las pantallas con `print:hidden`.
- Para la tienda, un cliente con lista de precios (Mascotas Varela) y otro sin ella (Patitas) ven
  precios distintos: es un buen contraste para cualquier cambio de precios.
