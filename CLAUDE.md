# Onaks System — contexto del proyecto

Sistema de pedidos B2B para una distribuidora (zona sur del GBA). Tres tipos de usuario:

- **ADMIN**: da de alta a los clientes (no hay registro público), gestiona productos y pedidos.
- **CLIENT**: entra con usuario y contraseña, ve el catálogo, arma un carrito y compra.
- **DRIVER** (repartidor): solo carga las entregas de sus hojas de ruta, desde el celular (`/delivery`).
  Un admin también puede repartir (`routes:deliver`). Los usuarios internos (Admin o Repartidor) se
  crean en `/admin/users`; el ABM de repartidores (`drivers`) vincula cada uno a un usuario.

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
- Raíz: solo docs y configuración no funcional (`.github/`, `release-please-*.json`, README, `docs/`).
- Producción: `app/docker-compose.prod.yml` se suma al compose base (imágenes de GHCR por `APP_VERSION`,
  sin puertos de base ni app publicados, Caddy y backups). Caddy en `app/deploy/caddy/` (un Caddyfile por
  `TLS_MODE`: `auto`, `custom`, `proxy`, más `app.caddy` común); backups diarios con
  `app/deploy/backup/backup.sh` (`pg_dump` + `uploads`, retención). Guía completa en `docs/instalacion.md`.
- `uploads/`, `certs/` y `backups/` nunca van a la imagen (`.dockerignore` y `outputFileTracingExcludes`:
  el tracing de `standalone` copiaba la carpeta local de uploads) ni al repo (`.gitignore`).
- `app/src/generated/prisma`: cliente generado, no se versiona (lo crea el `postinstall`).
- `app/src/lib/db.ts`: cliente Prisma singleton. No valida `DATABASE_URL` al importar a propósito,
  para que `next build` y `prisma generate` anden sin base de datos.

## Auditoría y seguridad

- Todo cambio de datos se registra con `audit(tx, {...})` (`lib/audit`) **dentro de la misma transacción**
  (`db.$transaction`), con `before`/`after`. Guarda IP y user agent solo. `passwordHash` nunca se guarda.
- `audit_logs` es solo de inserción (trigger en la DB) y se guarda indefinidamente. Visor en `/admin/audit` (permiso `audit:read`).
- Las tablas de negocio llevan `created_by`/`updated_by` (por ahora `measurement_units`; se agregan al tocar cada tabla).
- `ACCESS_DENIED` se registra solo en Server Actions (`requirePermission`/`requireUser`), no al renderizar.
- Cabeceras de seguridad para todo en `next.config.ts` (sin iframe, nosniff, referrer, cámara y GPS solo
  propios, HSTS en producción; sin `X-Powered-By`). Sin CSP todavía: el script inline del tema necesitaría
  nonce.
- CSV (`lib/csv`): un texto que empieza con `=`, `+`, `-`, `@` lleva `'` adelante (inyección de fórmulas
  en Excel); los números quedan igual.
- Firmas y fotos de remitos (`app/media/deliveries/[file]`): las ve quien tiene `sales:read-all`; un
  repartidor, solo las de sus hojas.
- La IP de auditoría y del bloqueo de login sale del primer `x-forwarded-for`: confiable solo detrás de un
  proxy que lo reemplaza (Caddy) y sin publicar el puerto de la app.
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

## Reparto

- Repartidores (`/admin/drivers`: nombre, teléfono, usuario vinculado opcional) y vehículos
  (`/admin/vehicles`: patente normalizada en mayúsculas, capacidad opcional en kg y litros). Sin
  borrado: se desactivan. Validación en `lib/fleet`; permiso `routes:manage`.
- Hojas de ruta (`/admin/routes`, `route_sheets` + `route_stops`): Armando → En reparto → Cerrada.
  Paradas: pedidos Listos para despachar sin otra hoja abierta (chequeo con los pedidos bloqueados).
  Se arman desde la hoja o desde "Por zona" (usa las casillas de la barra masiva). Salir pasa todos
  los pedidos a En reparto con `applySaleStateChange` en una transacción (todo o nada, ordenados por
  cliente para no cruzar bloqueos); "Volver a armando" los devuelve. Impresión en `[number]/print`
  con el monto a cobrar por parada (`amountsToCollect`: pedido + deuda anterior una vez por cliente,
  solo paradas pendientes).
- Carga por parada (`/delivery/[hoja]/[posición]`, pensada para celular): el repartidor vinculado o un
  admin marca entregado (firma en pantalla con aclaración o foto del remito, cobro opcional a la cuenta
  corriente con `createCustomerPayment`) o no entregado con motivo; se guarda hora y GPS si el
  celular lo da. Entregado → pedido Entregado (deuda); no entregado → Listo para despachar. Un admin
  puede deshacer una carga mientras la hoja está en reparto. Firmas y fotos: `lib/delivery-files`
  (WebP en `UPLOADS_DIR/deliveries`), servidas **con sesión** por `app/media/deliveries/[file]`.
- Entrega parcial (en la misma parada): `lib/partial-delivery` valida cuánto se entregó y el motivo;
  `applyShortages` (en la transacción, antes de pasar a Entregado) devuelve lo faltante al depósito de
  donde salió (`SALE_RETURN`) y, si se rompió o venció, además lo da de baja (`WRITE_OFF`), ajusta las
  cantidades y totales del pedido y lo audita. Lo faltante queda en `route_stops.shortages`. Una entrega
  parcial no se deshace desde la parada.
- Cierre (`closeRouteSheet`, admin): con todas las paradas cargadas, rendición del efectivo. Lo esperado
  es la suma de cobros en efectivo de las paradas sin anular (`summarizeCollections`, calculado con la
  hoja bloqueada); si lo entregado no coincide, comentario obligatorio. Se guardan esperado, recibido,
  comentario y quién cerró. Con la hoja cerrada, los pedidos no entregados quedan libres para otra.

## Compras

- Stock mínimo opcional por producto (`products.min_stock`); en `/admin/stock` el nivel "Bajo el mínimo"
  compara contra el total de depósitos. Permiso `purchases:manage` (ADMIN).
- Órdenes de compra (`/admin/purchases`, `purchase_orders` + `purchase_order_items`): Borrador →
  Enviada → Recibida parcial / Recibida, o Anulada (solo sin nada recibido). Se arman por proveedor con
  sus productos y la sugerencia `suggestQuantity` (`lib/purchase-order`): mínimo + reservado − stock −
  pendiente de otras OC enviadas, redondeada para arriba si la unidad no admite decimales. El costo se
  precarga con el último del proveedor. Las líneas guardan foto de costo e IVA. Consultas en
  `lib/purchase-queries`. Impresión en `[number]/print` y texto para WhatsApp sin precios (si el
  portapapeles no se puede usar, se muestra el texto para copiar a mano).
- Informes de recepción (`/admin/receipts`, `goods_receipts` + `goods_receipt_items`, cargados desde la
  OC en `[number]/receive`): un depósito por informe, remito opcional, lo que llegó por producto (se
  precarga lo pendiente; de más se acepta con aviso) y lo pendiente en ese momento para la diferencia.
  Ingresan el stock con `recordReceiptMovements` (`PURCHASE_RECEIPT`, con `goods_receipt_id`), suman a
  `received_quantity` y recalculan el estado de la OC (`orderStateFor` en `lib/goods-receipt`). Se
  anulan con motivo (`PURCHASE_RECEIPT_REVERSAL`, reabre la OC). Una OC Recibida parcial se cierra con
  faltante (`closed_at` + motivo, queda Recibida). Orden de bloqueo: **OC (`lockPurchaseOrder`), informe
  y saldos**.
- Facturas de proveedores (`/admin/invoices`, `supplier_invoices` + `supplier_invoice_items`, cargadas
  desde la OC en `[number]/invoice`): comprobante (tipo, punto de venta, número; repetido por proveedor
  se rechaza con el proveedor bloqueado), líneas con la alícuota de la OC, percepciones y total impreso.
  Control de 3 vías en `matchInvoice` (`lib/supplier-invoice`): costo ≠ OC, cantidad > recibido sin
  facturar, total impreso ≠ calculado; se guardan en `differences` (JSON). Sin diferencias → Aprobada;
  con → Observada hasta que se aprueba con comentario. Al aprobarse, `updateLastCosts`
  (`lib/supplier-invoice-ledger`) pasa el costo al último del proveedor si no hay uno más nuevo. Se
  anulan con motivo. Un IR no se anula si deja lo recibido por debajo de lo facturado.
- Cuenta corriente de proveedores (`/admin/suppliers/[id]/account`, deuda en `/admin/supplier-debts`):
  facturas aprobadas − órdenes de pago − notas de crédito, sin anuladas (`summarizeSupplierAccount` en
  `lib/supplier-account`, en centavos; vencida = con saldo y vencimiento anterior a hoy, sin vencimiento
  cuenta la fecha). OP (`supplier_payments` + `supplier_payment_lines`, `/admin/supplier-payments`, con
  impresión): varios medios (efectivo, transferencia, cheque, retención). Notas de crédito por importe
  (`supplier_credit_notes`, `/admin/credit-notes`). Ambas se imputan a facturas aprobadas con saldo en
  `supplier_allocations` (elige el admin, `autoAllocate` precarga de la más vieja; lo que sobra queda a
  cuenta y se imputa después). Anular una OP o NC deja sus imputaciones sin efecto (las filas quedan).
  Una factura con imputaciones vigentes no se anula. Todo con el proveedor bloqueado (`lockSupplier`,
  `lib/supplier-account-ledger`); orden: OC, factura, proveedor.
- Forms con selects o valores que se calculan en vivo: campos controlados con `useFieldValues` y
  `onSubmit={submitWithoutReset(action)}` (`components/ui/use-field-values`). React resetea el `<form
action>` después de cada action: los no controlados pierden lo tipeado con un error y un select
  controlado vuelve a su primera opción.

## Picking

- Listas de picking (`/admin/picking`, `picking_lists` + `picking_list_items` por pedido y producto),
  armadas desde las casillas de "Todos" o "Por zona" (`PickingFromSelection`, como `RouteFromSelection`).
  Un depósito por lista y solo pedidos Pendientes: `createPickingList` los pasa a En preparación con
  `applySaleStateChange` (descuenta de ese depósito), ordenados por cliente, todo o nada. Confirmar
  (`confirmPickingList`) pasa cada pedido a Listo para despachar y aplica los faltantes con
  `applyShortages` (`lib/partial-delivery-ledger`, compartido con la entrega parcial): SALE_RETURN y,
  según el motivo, WRITE_OFF (roto o vencido) o ADJUSTMENT por diferencia (`recordStockCorrection`, no
  había). Sacar un pedido o anular la lista lo devuelve a Pendiente. Orden de bloqueo: lista, después
  cuenta del cliente y pedido.
- Ubicación por producto y depósito en `product_stocks.location` (se edita en `/admin/stock/[producto]`;
  si no hay saldo, crea la fila en 0). El recorrido (`pickingRoute` en `lib/picking`) agrupa por
  producto y ordena por ubicación en orden natural (`A-2` antes que `A-10`), sin ubicación al final.

## UI del admin

- Menú lateral agrupado por secciones, definido en `app/src/app/[lang]/admin/layout.tsx` (un grupo aparece
  cuando tiene alguna pantalla). En mobile es un panel con ☰. Inicio del admin: dashboard en `/admin`.
- Tema claro/oscuro/sistema (default sistema) guardado por navegador en localStorage; `data-theme` en
  `<html>` lo aplica un script inline antes del paint. Para estilos por tema usar la variante `dark:`.
- Celular: las pantallas usan `p-4 sm:p-8` y toda tabla va dentro de
  `<div className="overflow-x-auto print:overflow-visible">` (scroll propio en pantalla, sin cortar columnas
  al imprimir). Los números de comprobante en tablas, con `whitespace-nowrap`.
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
  (incluirlo en los backups). Server Actions aceptan hasta 10 MB (`next.config.ts`): las fotos de remito
  del celular llegan sin achicar (hasta 8 MB).
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
  El núcleo es `applySaleStateChange` (`lib/sale-state-change`), compartido con el cambio masivo
  (`changeSalesStateBulk`: un pedido por transacción, informa el resultado de cada uno). Las casillas
  de las tablas se asocian a la barra con el atributo `form` (`components/orders/bulk-state-bar`).
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
  (con `password_must_change = true`). Con `SEED_DEMO=true` suma la demo (`prisma/seed-demo.ts`):
  categorías, 2 depósitos, 12 productos con stock (ingresos en el libro) y ubicación, 2 proveedores, 3
  clientes con usuario, un repartidor con vehículo y 4 pedidos pendientes. Usuarios `*@demo.onaks.local`
  con `DEMO_PASSWORD` (`demo1234`, sin cambio obligatorio): `admin`, `reparto`, `patitas`, `sanroque`,
  `varela`. Solo carga en una base sin productos y falla con `NODE_ENV=production`. Los tests de punta a
  punta usan esta demo.
- El seed corre en la imagen `migrator` (Dockerfile), que solo tiene `prisma/` y `src/lib`: lo que
  importe el seed tiene que estar ahí (y sin el alias `@/`).

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
  typecheck, test, migraciones + drift, build) y `docker` (valida el compose de producción y los
  Caddyfile, compose + `/api/health`) solo si cambia `app/`.
  `ci-ok` resume todo y es el único check required.
- `.github/workflows/release.yml` (PR mergeado): release-please; si crea release, publica en GHCR
  `<repo>:<versión>` y `<repo>-migrator:<versión>` (`latest` solo en estables).
- Secret opcional `RELEASE_PLEASE_TOKEN` (PAT) para que el PR de release dispare los checks.
