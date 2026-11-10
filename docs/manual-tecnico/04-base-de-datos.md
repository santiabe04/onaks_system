# 4. Base de datos

PostgreSQL 18 con Prisma 7. El modelo está en `app/prisma/schema.prisma` y las migraciones en
`app/prisma/migrations/`. Es la fuente de verdad del dominio: si algo de este capítulo contradice al
schema, manda el schema.

## Convenciones del modelo

| Tema               | Regla                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nombres            | Tablas y columnas en `snake_case` con `@@map` / `@map`. Modelos y campos de Prisma en camelCase.                                                                                                                                                                                            |
| Ids                | CUID2 (`@default(cuid(2))`), validados con `isCuid` (`lib/ids.ts`). Los catálogos chicos (`measurement_units`, `categories`, `tax_rates`, `states`, `cities`) usan enteros autoincrementales; por eso `categoryId` y `cityId` son `number` en el código y el resto de los ids son `string`. |
| Fechas             | `timestamptz` (UTC). El día argentino se calcula en la app (`lib/order-period.ts`).                                                                                                                                                                                                         |
| Plata              | `Decimal(12,2)`, neto (sin IVA) salvo `total`. Tasas (IVA, % descuento, ajuste) en `Decimal(5,4)` como **fracción** (`0.21`, `0.105`, `-0.1`).                                                                                                                                              |
| Cantidades         | `Decimal(12,3)` en stock, `Decimal(12,4)` en ítems de pedido. La unidad define si admiten decimales (`measurement_units.allows_decimals`).                                                                                                                                                  |
| Números visibles   | `number` (autoincremental, único) en `sales`, `route_sheets`, `purchase_orders`, `goods_receipts`, `supplier_payments` y `picking_lists`: es lo que ve la gente (`#12`) y lo que va en la URL. El id interno nunca se muestra.                                                              |
| Borrado            | Soft delete con `deleted_at` en `products`, `customers`, `persons`, `users`, `customer_addresses`. Desactivar con `is_active`. Anular con motivo (`voided_at`, `annulled_at`, `canceled_at`).                                                                                               |
| Auditoría de autor | `created_by` / `updated_by` en tablas de negocio (se agregan al tocar cada tabla; `null` en lo que carga el seed).                                                                                                                                                                          |
| Fotos              | Lo que cambia con el tiempo y tiene que quedar fijo en el comprobante se **copia** (ver abajo).                                                                                                                                                                                             |

### Fotos: el patrón más importante del modelo

Un pedido, una OC o una factura tienen que mostrar lo que valía **cuando se hicieron**, aunque después
cambie el producto. Por eso las líneas guardan una copia:

- `sale_items`: `unit_price` (neto que pagó el cliente), `unit_list_price` (neto base, la diferencia es la
  bonificación), `unit_weight`, `unit_volume`, `unit_tax_rate`, `unit_cost` (último costo de compra, para
  el margen).
- `purchase_order_items`: costo e IVA de la línea. `supplier_invoice_items`: lo facturado.
- `route_stops.shortages` (JSON): lo que faltó en la entrega. `credit_hold_reasons` (JSON): por qué se
  retuvo un pedido.

Cambiar una alícuota o un precio afecta a lo que se vende **desde ese momento**, nunca a lo ya hecho.

## Mapa de tablas por dominio

| Dominio             | Tablas                                                                                                                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo base       | `measurement_units`, `categories` (árbol de hasta 3 niveles), `tax_rates`, `products`, `warehouses`                                                                                                                                                               |
| Stock               | `product_stocks` (saldo por producto y depósito, con `location`), `stock_lots` (lotes con vencimiento), `stock_counts` + `stock_count_items` (conteos de inventario), `stock_movements` (libro)                                                                   |
| Personas y accesos  | `customers`, `persons`, `users`, `customer_addresses`, `states`, `cities`, `login_attempts`                                                                                                                                                                       |
| Precios             | `price_lists`, `price_list_items` (y `discounts` / `used_discounts`, heredadas, sin uso)                                                                                                                                                                          |
| Ventas              | `cart_items`, `customer_favorites` (favoritos por empresa), `sales`, `sale_items`, `customer_payments` y `customer_credit_notes` (+ `_items`): la cuenta corriente del cliente; `transfer_settings` (datos de cobro, una fila) y `transfer_proofs` (comprobantes) |
| Picking y reparto   | `picking_lists`, `picking_list_items`, `drivers`, `vehicles`, `route_sheets`, `route_stops`                                                                                                                                                                       |
| Compras             | `suppliers`, `supplier_products`, `purchase_orders`(+`_items`), `goods_receipts`(+`_items`), `supplier_invoices`(+`_items`)                                                                                                                                       |
| Pagos a proveedores | `supplier_payments`(+`_lines`), `supplier_credit_notes`, `supplier_allocations`                                                                                                                                                                                   |
| Transversal         | `audit_logs` (solo inserción)                                                                                                                                                                                                                                     |

Relaciones que conviene tener presentes:

- `customers` 1—N `persons` (cada persona puede tener un `users`) y 1—N `customer_addresses`. **Las
  direcciones son del cliente**, no de la persona: cualquier persona del cliente compra a cualquiera. La
  zona de reparto sale de `customer_addresses.city_id`.
- `sales.address_id` apunta a la dirección; el cliente de un pedido se alcanza como
  `sale.address.customerId`. Por eso casi todos los filtros por cliente son `address: { customerId }`.
- `sales.user_id` es quien lo cargó: un `CLIENT` o un `ADMIN` (pedido por teléfono). Es lo que decide si el
  cliente lo ve como suyo o como "La distribuidora".
- `persons.customer_id` es `null` para los internos (admin, repartidor).

## Migraciones

Se aplican con `prisma migrate deploy` (en desarrollo: `npm run db:deploy`; en producción las corre el
servicio `migrate`). Una por cambio, nombradas `AAAAMMDDHHMMSS_nombre`.

### Crear una migración

```bash
# 1. Editar prisma/schema.prisma.
# 2. Generar el SQL sin aplicarlo, para poder revisarlo y completarlo:
npm run db:migrate -- --create-only --name nombre_corto
# 3. Revisar la carpeta nueva, agregar lo que Prisma no genera (checks, triggers, backfills).
# 4. Aplicarla y regenerar el cliente:
npm run db:deploy && npx prisma generate
```

En este proyecto las últimas migraciones se armaron con `prisma migrate diff` y se escribieron a mano en
una carpeta nueva. Cualquier camino sirve mientras el resultado cumpla las reglas de abajo.

### Reglas

1. **El schema y las migraciones tienen que coincidir.** El CI corre
   `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` contra una
   base ya migrada: si hay diferencia, falla. Verificarlo local antes del PR.
2. **Un `NOT NULL` sin default sobre una tabla con datos** se hace en tres pasos dentro de la misma
   migración: agregar la columna nullable, rellenar (`UPDATE ... SET`) y recién ahí `SET NOT NULL`.
   Ejemplo: `20261030120000_price_lists` (`unit_list_price`).
3. **Backfill con criterio de negocio**, no valores arbitrarios: `delivered_at` se completa desde la
   auditoría (`20261030180000_sales_reports`), `unit_cost` desde el último costo del proveedor.
4. **Valores de enum nuevos** (`ALTER TYPE ... ADD VALUE`): `AuditEntity` crece con cada entidad auditada.
5. **Sin migraciones "down"**: para volver atrás se restaura un backup. Una migración no debe romper a la
   versión anterior de la app mientras se despliega (ver el [capítulo 3](03-produccion.md#actualizar-un-servidor)).
6. **Nunca editar una migración ya mergeada**: se agrega otra.
7. La migración `init` se escribió a mano (sin motor de Prisma disponible); no hace falta imitarla.

### Lo que Prisma no soporta: se escribe a mano en el SQL

- **CHECK constraints**: están en `20261023000001_checks` y en el final de cada migración posterior (por
  ejemplo `customer_credit_limit_not_negative_chk`, `price_list_adjustment_over_minus_one_chk`). Sirven
  de red de seguridad: la app valida antes, pero la base rechaza lo imposible aunque haya un bug.
- **Triggers de solo inserción** en `audit_logs` y `stock_movements`: rechazan `UPDATE`, `DELETE` y
  `TRUNCATE`. Un libro que se puede editar no es un libro.
- **Índices parciales o con `NULLS NOT DISTINCT`**: p. ej. el nombre único entre categorías hermanas,
  incluida la raíz (`categories`).

## Transacciones y bloqueos

Toda escritura de negocio va en `db.$transaction(async (tx) => { ... })`. Dentro:

- Se leen y bloquean primero las filas que decidirán el resultado (`SELECT ... FOR UPDATE` con
  `tx.$queryRaw`).
- Se valida contra lo **bloqueado** (no contra lo que se vio al renderizar la página).
- Se escribe y se audita (`audit(tx, ...)`).

### El problema que resuelve

Dos admins cambian el estado del mismo pedido a la vez, o el cliente confirma dos veces: sin bloqueo, el
stock se descuenta dos veces o el pedido se duplica. Con `FOR UPDATE`, la segunda transacción espera a la
primera y recién ahí lee el estado ya actualizado (y, por ejemplo, falla con "el estado cambió mientras lo
mirabas").

### Orden de bloqueo (obligatorio)

Para que dos transacciones no se bloqueen mutuamente (deadlock), **siempre se bloquea en el mismo orden**:

| Circuito                            | Orden                                                 | Helper                                         |
| ----------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| Cobros, cambios de estado, checkout | **cuenta del cliente, después el pedido**             | `lockAccount` (`lib/account-ledger`)           |
| Picking                             | lista de picking, después cuenta del cliente y pedido | `createPickingList`, `confirmPickingList`      |
| Hoja de ruta                        | pedidos ordenados por cliente (todo o nada)           | `applySaleStateChange` en bucle                |
| Stock                               | saldos de producto-depósito, en orden fijo            | `recordMovement` (`lib/stock-ledger`)          |
| Recepción de compras                | OC, informe de recepción, saldos                      | `lockPurchaseOrder` (`lib/purchase-lock`)      |
| Facturas y pagos a proveedores      | OC, factura, proveedor                                | `lockSupplier` (`lib/supplier-account-ledger`) |

Regla práctica: **si tu código toca la cuenta de un cliente y un pedido, bloqueá primero la cuenta**
(`lockAccount`). Si procesás varios pedidos en una transacción, ordenalos por cliente.

`FOR SHARE` se usa para evitar que alguien desactive un depósito mientras se mueve stock (la desactivación
pide el lock exclusivo de la fila para chequear que no tenga saldo).

### Idempotencia ante dobles envíos

- El checkout **vacía el carrito antes de crear el pedido**: un doble clic encuentra el carrito ya vacío y
  falla en vez de duplicar (`deleteMany` y chequeo de cantidad).
- Una huella del carrito (`lib/cart-fingerprint.ts`: productos, cantidades, precios del cliente, IVA) viaja
  en el form; si cambió entre que se mostró y se confirmó, se rechaza para que el cliente revise el total.
- El estado esperado (`from`) viaja en el form de cambio de estado y se compara con el bloqueado.

## Libros de solo inserción

### `stock_movements` y `product_stocks`

`product_stocks.quantity` es el saldo por producto y depósito (puede ser negativo: se vende antes de
recibir). `stock_movements` es el libro. **El saldo se cambia solo con `recordMovement`** (o sus variantes
`recordSaleMovements`, `recordReceiptMovements`, `recordStockCorrection` en `lib/stock-ledger.ts`), que en una
transacción:

1. valida producto y depósitos activos,
2. bloquea los saldos (`FOR UPDATE`, en orden),
3. calcula las "patas" del movimiento (`lib/stock.ts`, en milésimas con BigInt),
4. escribe saldo + movimiento + auditoría.

Tipos de movimiento (`StockMovementType`): `ENTRY`, `ADJUSTMENT`, `WRITE_OFF`, `TRANSFER_OUT/IN`, `SALE`,
`SALE_RETURN`, `PURCHASE_RECEIPT`, `PURCHASE_RECEIPT_REVERSAL`, `CUSTOMER_RETURN`,
`CUSTOMER_RETURN_REVERSAL`. Los de pedido llevan `sale_id`; los de recepción, `goods_receipt_id`; los de una
devolución de cliente, `customer_credit_note_id`.

**Cada tipo nuevo hay que sumarlo al CHECK `stock_movement_direction_chk`**, que fija el signo: los que
ingresan (`ENTRY`, `TRANSFER_IN`, `SALE_RETURN`, `PURCHASE_RECEIPT`, `CUSTOMER_RETURN`) son positivos y los
que sacan (`WRITE_OFF`, `TRANSFER_OUT`, `SALE`, `PURCHASE_RECEIPT_REVERSAL`, `CUSTOMER_RETURN_REVERSAL`)
negativos. Se hace con `DROP CONSTRAINT` + `ADD CONSTRAINT` en la migración, comparando `"type"::text` (los
valores nuevos de un enum no se pueden usar en la misma transacción que los crea). Si se olvida, el primer
movimiento falla en runtime con `violates check constraint "stock_movement_direction_chk"`. Una transferencia son dos patas (salida y entrada). Corregir un error
nunca edita un movimiento: se registra otro que lo compensa.

### `audit_logs`

Ver el [capítulo 1](01-arquitectura.md#auditoría). Se escribe siempre en la misma transacción que el
cambio. El historial del pedido, el visor `/admin/audit` y los avisos del dashboard salen de acá.

### `customer_payments` y `customer_credit_notes`

Cobros (`PAYMENT`) y reintegros (`REFUND`) del cliente, y sus notas de crédito (devoluciones y ajustes).
No se borran: se **anulan con motivo** (`voided_at`). La deuda no se guarda: se calcula (ver [capítulo 5](05-modulos.md#6-cuenta-corriente-y-crédito)).

## Seed

`prisma/seed.ts` (idempotente) carga provincias, partidos del sur del GBA, unidades de medida, alícuotas
(21 / 10,5 / 27 / 0 %) y el primer admin (con cambio de contraseña obligatorio). Con `SEED_DEMO=true` suma
la demo (ver el [capítulo 2](02-desarrollo.md#datos-de-demo)). Corre con `tsx` vía `prisma db seed`
(configurado en `prisma.config.ts`).

## Prisma 7: detalles que sorprenden

- El generator es `prisma-client` y el cliente se genera en `src/generated/prisma` (**no se versiona**; lo
  crea el `postinstall` o `npx prisma generate`). Después de cambiar el schema hay que regenerarlo para
  que TypeScript vea los campos nuevos.
- La conexión usa el adaptador `@prisma/adapter-pg` (`lib/db.ts`). `db` es un singleton que sobrevive al
  hot reload en desarrollo.
- `prisma.config.ts` define la URL de la base **sin `env()`** a propósito: `prisma generate` (en el
  `postinstall`) tiene que funcionar sin `DATABASE_URL`.
- Los `Decimal` de Prisma llegan como objetos `Prisma.Decimal`; para cuentas se convierten a `string` y se
  opera con enteros (ver `lib/cart.ts`). Nunca `Number(...)` para plata.
- Las consultas SQL crudas (`tx.$queryRaw`) devuelven `Decimal` como `Prisma.Decimal` o `string` según la
  columna: castear en el SQL (`"quantity"::text`) cuando haga falta.
- Para borrar un JSON de una columna hay que usar `Prisma.DbNull`, no `null` ni `undefined`.
