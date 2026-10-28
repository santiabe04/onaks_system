# Onaks System — contexto del proyecto

Sistema de pedidos B2B para una distribuidora (zona sur del GBA). Dos tipos de usuario:

- **ADMIN**: da de alta a los clientes (no hay registro público), gestiona productos y pedidos.
- **CLIENT**: entra con usuario y contraseña, ve el catálogo, arma un carrito y compra.

El admin ve los pedidos de la semana **agrupados por zona** (partido/localidad) con datos de
entrega: método de pago, peso y volumen totales, montos. La agrupación es una consulta por rango de
fechas, no un job programado: `/admin/orders` lee los pedidos del período (semana de **sábado a
viernes**, `lib/order-period`, o rango libre) sin los cancelados y los agrupa por localidad con
`lib/orders-by-zone` (en enteros). El detalle de solo lectura está en `/admin/orders/[number]`.
La consulta del período es `getPeriodOrders` (`lib/orders-by-zone-queries`), compartida con el CSV
(`/admin/orders/export`, `;` y coma decimal en español, con BOM para Excel) y el widget del dashboard.
Para imprimir: `print:hidden` en lo que no va al papel (menú, controles); en papel el tema es siempre claro.
"Todos los pedidos" (`/admin/orders/list`) filtra con `lib/order-filters` (estados múltiples, pago, cliente,
localidad, producto, número y fechas, todo por URL); con un producto muestra cuánto se pidió de él.
La vista por zona y el CSV aceptan los mismos filtros salvo número y fechas (`zoneOrderWhere`: sin
estados elegidos excluye cancelados); los campos del form son `components/orders/order-filter-fields`.

Idioma: el usuario habla en español rioplatense. Código, commits y nombres en inglés;
comentarios y textos de UI en español.

## Stack

- Next.js 16 (App Router, `cacheComponents: true`, `output: "standalone"`), React 19, Tailwind 4
- Prisma 7 (generator `prisma-client`, adaptador `@prisma/adapter-pg`) + PostgreSQL 18 (`postgres:18-alpine`)
- Auth propia: `bcryptjs` para hashes + `jose` para la sesión firmada en cookie httpOnly (sin Auth.js)
- Zod para validación, Vitest para tests, npm como gestor de paquetes, Node 22

@app/AGENTS.md

## Estructura

- `app/`: **todo el código** (Next, Prisma, Dockerfile, tooling, husky). Los comandos de npm se corren acá.
- Raíz: solo docs y configuración no funcional (`.github/`, `release-please-*.json`, README).
- `app/src/generated/prisma`: cliente generado, no se versiona (lo crea el `postinstall`).
- `app/src/lib/db.ts`: cliente Prisma singleton. No valida `DATABASE_URL` al importar a propósito,
  para que `next build` y `prisma generate` anden sin base de datos.

## Auditoría y seguridad

- Todo cambio de datos se registra con `audit(tx, {...})` (`lib/audit`) **dentro de la misma transacción**
  (`db.$transaction`), con `before`/`after`. Guarda IP y user agent solo. `passwordHash` nunca se guarda.
- `audit_logs` es solo de inserción (trigger en la DB) y se guarda indefinidamente. Visor en `/admin/audit` (permiso `audit:read`).
- Las tablas de negocio llevan `created_by`/`updated_by` (por ahora `measurement_units`; se agregan al tocar cada tabla).
- `ACCESS_DENIED` se registra solo en Server Actions (`requirePermission`/`requireUser`), no al renderizar.
- Login: bloqueo de 15 min con 5 fallos por mail+IP o 20 por mail (`login_attempts`, `lib/login-throttle`).
- `users.session_version` va en el token; incrementarlo revoca las sesiones (al cambiar o blanquear la
  contraseña y al desactivar un usuario).
- Usuarios: no hay registro público. El admin crea el usuario de una persona (CLIENT si tiene cliente,
  ADMIN si no) con una contraseña generada (`lib/temp-password`) que se muestra **una sola vez** y hay que
  cambiar al entrar. También blanquea, desactiva/reactiva y desbloquea el login (`/admin/users` y la
  pantalla de cada cliente). Un admin no se blanquea ni se desactiva a sí mismo.

## Tienda (clientes)

- Route group `app/src/app/[lang]/(shop)/`: catálogo en `/` (búsqueda, árbol de categorías con solo
  las ramas que tienen productos, tarjetas o lista con selector guardado por navegador, 24 por página)
  y detalle en `/products/[id]`. Los admins también entran (link al panel en el header).
- El cliente ve los productos vigentes y **activos** (`VISIBLE_PRODUCT` en `lib/catalog`); el stock no
  se muestra ni oculta nada: si no se quiere vender, el admin pausa el producto.
- Precio: final grande + "neto + IVA x%" (`lib/catalog-queries` formatea todo en el server).
- Pedido (4.2): `/checkout` (dirección de la empresa, comentario, solo efectivo) → `placeOrder`, que en
  una transacción recalcula todo, compara la huella del carrito (`lib/cart-fingerprint`: productos,
  cantidades, precios, IVA) con la que vio el cliente y la rechaza si cambió; vacía el carrito **antes**
  de crear el pedido (así un doble envío no lo duplica) y guarda la foto en `sale_items` + auditoría.
- `sales.number` es el número correlativo que ve la gente (`/orders/[number]`). "Mis pedidos" muestra
  los de **toda la empresa** (filtro por `address.customerId`); uno ajeno da 404.
- El cliente cancela un pedido Pendiente desde "Mis pedidos". Si el admin lo habilita
  (`sales.customer_can_edit`, se usa una vez), lo modifica: sus ítems se suman al carrito
  (`editing_person_id`, uno por persona) y `placeOrder` reemplaza ese pedido (mismo número) en vez de
  crear otro. Mientras se modifica, el admin no le cambia el estado.
- Stock reservado = cantidades de pedidos en `RESERVED_SALE_STATES` (`lib/checkout`, hoy solo PENDING);
  se muestra en `/admin/stock` como Reservado y Disponible = total − reservado.

## UI del admin

- Menú lateral agrupado por secciones, definido en `app/src/app/[lang]/admin/layout.tsx` (un grupo aparece
  cuando tiene alguna pantalla). En mobile es un panel con ☰. Inicio del admin: dashboard en `/admin`.
- Tema claro/oscuro/sistema (default sistema) guardado por navegador en localStorage; `data-theme` en
  `<html>` lo aplica un script inline antes del paint. Para estilos por tema usar la variante `dark:`.
- `usePathname()` devuelve la ruta interna (`/es/...`) al prerenderizar: normalizar con `stripLocalePrefix`.

## Idiomas (i18n)

- Español (default) e inglés, uno por instalación con la env `APP_LOCALE` (`es` | `en`), leída en runtime.
- Todas las páginas viven en `app/src/app/[lang]/` y se prerenderizan para los dos idiomas. Las URLs
  públicas no llevan prefijo: el proxy reescribe `/login` → `/es/login`. Fuera de `[lang]` solo queda `api/health`.
- Textos en `app/src/i18n/dictionaries/{es,en}.ts` (`es` define el tipo). Solo strings, con `{x}` + `interpolate`.
- Server Components: `getT()` / `getLocale()` de `@/i18n/server` (usa `next/root-params`).
  Server Actions: `getActionDictionary()` de `@/i18n/dictionary` (lee `APP_LOCALE`). Client Components: reciben el slice por props.
- Las validaciones Zod reciben los mensajes del diccionario. Formato de plata/números/fechas: `formatters(locale)`.
- Los datos (productos, unidades, etc.) y el nombre de la app (`lib/app.ts`) no se traducen.

## Base de datos

- Modelo en `app/prisma/schema.prisma` (traducido de `schema.dbml`). Tablas en snake_case con `@@map`/`@map`.
- IDs: CUID2 (`@default(cuid(2))`), excepto catálogos chicos (`measurement_units`, `states`, `cities`) con autoincrement.
- Fechas en `timestamptz`. Plata en `Decimal(12,2)`, tasas (IVA, % descuento) en `Decimal(5,4)` como fracción (0.21, 0.105).
- Soft delete con `deleted_at` en products, customers, persons, users, customer_addresses.
- `sale_items` guarda una foto del producto al vender (`unit_price`, `unit_weight`, `unit_volume`, `unit_tax_rate`).
- El IVA del producto es una FK a `tax_rates` (ABM propio; el seed carga 21 / 10,5 / 27 / 0 %): cambiar
  una tasa afecta a todos sus productos, no a los pedidos ya hechos.
- Productos: precio **neto** (el final se calcula con `lib/price`, en enteros), SKU obligatorio en
  mayúsculas, código de barras opcional, solo en categorías finales (las actions de productos y de
  categorías comparten un lock de `categories`), peso en kg y volumen en litros, activo/pausado y soft delete.
- Imágenes de productos: `lib/product-image` (sharp → WebP de máx. 1200 px, sin EXIF) en
  `UPLOADS_DIR/products`, servidas por `app/media/products/[file]`. En Docker es el volumen `uploads`
  (incluirlo en los backups). Server Actions aceptan hasta 6 MB (`next.config.ts`).
- Stock por depósito: saldo en `product_stocks` (puede ser negativo) y libro `stock_movements` (solo
  inserción, trigger). El saldo se cambia **solo** con `recordMovement` (`lib/stock-ledger`), que bloquea
  los saldos (`FOR UPDATE`, en orden), calcula las patas (`lib/stock`, en milésimas con BigInt) y escribe
  saldo + movimiento + auditoría en la misma transacción. Cantidades con 3 decimales. Un depósito se
  desactiva solo sin stock.
- Carrito en la DB (`cart_items`, uno por persona, PK persona+producto), sin auditoría: no es dato del
  negocio hasta confirmar el pedido. Solo compra quien tiene `sales:create` (CLIENT). Los totales salen
  de `lib/cart` (en centavos/milésimas con BigInt); productos pausados o borrados quedan fuera del total.
- `measurement_units.allows_decimals`: si la unidad admite cantidades con decimales (kg, l) o solo enteras (u).
- Estados separados: `SaleState` (logística) y `SalePaymentState` (pago). Reglas en `lib/sale-state`:
  adelante (salteando pasos) o un paso atrás; cancelar hasta antes de Entregado; Cancelado es final.
  `changeSaleState` (permiso `sales:manage`) bloquea el pedido (`FOR UPDATE`), rechaza si el estado
  cambió mientras se miraba y, al llegar a En preparación, descuenta el stock (`SALE`) del depósito
  del pedido o del elegido por producto; al volver a Pendiente o cancelar devuelve el neto
  (`SALE_RETURN`, `pendingReturns`). Los movimientos llevan `sale_id`. El historial sale de la auditoría.
- Cuenta corriente por cliente (`customer_payments`: cobros y reintegros, se anulan con motivo, no se
  borran). Un pedido es deuda al entregarse (`CHARGED_SALE_STATES`); lo cobrado se imputa solo al pedido
  más viejo (`summarizeAccount` en `lib/account`, en centavos) y `recomputeAccount` guarda el estado de
  pago en `sales` en la misma transacción. Orden de bloqueo: **cuenta del cliente (`lockAccount`) y
  después el pedido**, en cobros, cambios de estado y confirmación. Reintegro: hasta el saldo a favor.
  Deudores (`/admin/debtors`): la misma cuenta en SQL para todos (`lib/debtors`). El cliente ve su saldo
  y últimos pagos en "Mis pedidos" (sin anulados ni quién los cargó).
- `new Date()` / `Date.now()` en un Server Component: antes, `await connection()` (si no, Next avisa
  que lee la hora del prerender).
- `customers` es la empresa (CUIT, razón social, condición IVA). `persons.customer_id` es null para admins.
  Un cliente tiene varias personas (cada una puede tener usuario; el mail es el login, único y en minúsculas).
- Las direcciones de entrega son del **cliente** (`customer_addresses`), no de la persona: cualquier persona
  del cliente compra a cualquiera de ellas. La zona de reparto sale de `city_id`.
- Dar de baja un cliente da de baja (soft delete) también sus personas y direcciones.
- **CHECK constraints** en `app/prisma/migrations/20261023000001_checks` (Prisma no los soporta).
  Para nuevos: `npm run db:migrate -- --create-only --name <x>` y escribir el SQL a mano.
- `categories`: árbol de hasta 3 niveles (reglas en `lib/category`, validadas con lock de tabla en la
  action). Nombre único entre hermanas, también en la raíz: índice `NULLS NOT DISTINCT` escrito a mano.
- Ejemplos de tests y datos: dominio de distribuidora de alimentos y productos para mascotas.
- La migración init se escribió a mano (sin engine de Prisma disponible). El CI corre
  `prisma migrate diff --from-config-datasource --to-schema ... --exit-code` para detectar drift.
- Seed idempotente (`app/prisma/seed.ts`): provincias, partidos del sur, unidades y admin inicial
  (con `password_must_change = true`).

## Comandos (en `app/`)

```bash
npm run dev | build | lint | typecheck | test | format
npm run db:migrate -- --name <x>   # nueva migración
npm run db:deploy                   # aplicar migraciones
npm run db:seed
docker compose up --build           # db + migrate + app
```

## Convenciones de Git y versiones

- **Conventional Commits** obligatorio (commitlint + husky en `app/.husky`). Squash merge: el título del PR es el commit.
- **release-please** versiona solo `app/` (paquete `app`, tags `vX.Y.Z` sin componente).
- Etapas con numeración continua: ALPHA (`1.0.0-alpha`) → BETA (siguiente minor `-beta`) → PROD (siguiente major).
  En cada salto de etapa se pone `release-as` en `release-please-config.json` y se borra después de la release.
  El sufijo se mantiene mientras sube MAJOR.MINOR.PATCH (versionado por defecto, no `"versioning": "prerelease"`).

## CI/CD

- `.github/workflows/ci.yml` (PR a main): `conventional-commits` siempre; `app-checks` (format, lint,
  typecheck, test, migraciones + drift, build) y `docker` (compose + `/api/health`) solo si cambia `app/`.
  `ci-ok` resume todo y es el único check required.
- `.github/workflows/release.yml` (PR mergeado): release-please; si crea release, publica en GHCR
  `<repo>:<versión>` y `<repo>-migrator:<versión>` (`latest` solo en estables).
- Secret opcional `RELEASE_PLEASE_TOKEN` (PAT) para que el PR de release dispare los checks.
