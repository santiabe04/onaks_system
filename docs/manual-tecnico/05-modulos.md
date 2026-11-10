# 5. Funcionamiento por módulos

Cada sección explica **qué hace** un módulo, **dónde está** el código, **las reglas que no se pueden
romper** y los **detalles que sorprenden**. Los nombres de archivos son relativos a `app/src/`. Antes de
leer, tené presente el patrón de [`lib/` puro vs. servidor](01-arquitectura.md#lib-dónde-vive-la-lógica) y
el [orden de bloqueo](04-base-de-datos.md#orden-de-bloqueo-obligatorio).

## Índice

1. [Catálogo, productos y categorías](#1-catálogo-productos-y-categorías)
2. [Precio del cliente: listas y descuentos](#2-precio-del-cliente-listas-y-descuentos)
3. [Carrito y checkout](#3-carrito-y-checkout)
4. [Pedido cargado por el admin](#4-pedido-cargado-por-el-admin)
5. [Estados del pedido y stock](#5-estados-del-pedido-y-stock)
6. [Cuenta corriente y crédito](#6-cuenta-corriente-y-crédito)
7. [Picking](#7-picking)
8. [Reparto](#8-reparto)
9. [Compras y proveedores](#9-compras-y-proveedores)
10. [Reportes](#10-reportes)
11. [Clientes, usuarios y seguridad](#11-clientes-usuarios-y-seguridad)
12. [Archivos subidos](#12-archivos-subidos)
13. [Pedidos del admin: vistas, filtros y CSV](#13-pedidos-del-admin-vistas-filtros-y-csv)

---

## 1. Catálogo, productos y categorías

**Qué hace.** El cliente ve los productos **vigentes y activos** en `/` (búsqueda, árbol de categorías,
tarjetas o lista, 24 por página) y el detalle en `/products/[id]`. El admin los administra en
`/admin/products`, `/admin/categories`, `/admin/measurement-units`, `/admin/tax-rates`,
`/admin/warehouses`.

**Dónde.** `app/[lang]/(shop)/page.tsx`, `lib/catalog.ts` (filtros puros, `VISIBLE_PRODUCT`),
`lib/catalog-queries.ts` (formato de precios en el server), `lib/product.ts` (validación),
`lib/category.ts` (árbol), `components/catalog/`.

**Reglas.**

- **Un producto es visible si `isActive && deletedAt == null`** (`VISIBLE_PRODUCT`). El stock no oculta
  nada: si no se quiere vender, el admin lo pausa. Todo lo que muestre o venda productos filtra con esa
  constante.
- El precio se guarda **neto** (sin IVA). El final se calcula con `lib/price.ts` (`finalPrice`, en enteros
  y con redondeo mitad hacia arriba). La alícuota es una FK a `tax_rates`: cambiar una tasa afecta a todos
  los productos que la usan, no a los pedidos ya hechos (las líneas guardan su copia).
- SKU obligatorio y en mayúsculas; código de barras opcional; peso en kg y volumen en litros; productos
  solo en categorías **finales** (hoja del árbol). Las actions de productos y de categorías comparten un
  lock sobre `categories` para que no se cree un producto en una categoría que justo recibe una hija.
- Categorías: árbol de hasta 3 niveles (`lib/category.ts`), nombre único entre hermanas (índice
  `NULLS NOT DISTINCT`, también en la raíz). El menú de la tienda solo muestra las ramas con productos
  visibles (`visibleCategoryTree`).
- Filtrar por una categoría incluye sus subcategorías (`descendantIds`).
- `measurement_units.allows_decimals` decide si un producto se vende por fracción (kg, litros) o solo por
  entero (unidad).
- Un depósito solo se desactiva sin stock; una unidad de medida o una alícuota solo se borran sin uso.

## 2. Precio del cliente: listas y descuentos

**Qué hace.** Cada cliente paga un precio que depende de su **lista de precios** y de un **descuento
propio**. Sin lista ni descuento, paga el precio base.

**Dónde.** `lib/customer-price.ts` (puro), `lib/pricing-queries.ts` (`getPricing`), `lib/price-list.ts`
(validación), `app/[lang]/admin/price-lists/`.

**Cómo se calcula** (todo en centavos con BigInt, mitad hacia arriba, en este orden):

```
neto de la lista = precio fijo del producto en la lista        (si existe)
                 | neto base × (1 + ajuste de la lista)         (si no)
neto del cliente = neto de la lista × (1 − descuento del cliente)
```

- `price_lists.adjustment` es una fracción con signo (`-0.1` = 10 % menos; `0.15` = 15 % más). Debe ser
  mayor a −1 (CHECK en la base).
- `price_list_items.price` es un precio neto fijo **que pisa el ajuste** de esa lista para ese producto.
- `customers.discount_rate` va de 0 a menos de 1 (CHECK).
- `getPricing(customerId, productIds, client?)` devuelve un `Pricing` `{ adjustment, discount, overrides }`
  (los precios fijos solo de los productos pedidos). Acepta una transacción. Sin cliente (un admin
  mirando la tienda) devuelve `BASE_PRICING`.
- `customerPrice(productId, basePrice, pricing)` es la función que usan todos: catálogo
  (`toCatalogItem`), carrito (`getCart`), checkout, pedido del admin y el form en vivo
  (`components/orders/new-order-form.tsx`, que recibe las listas por props).
- Cuando el precio del cliente es menor al base, la tienda muestra el base **tachado**.
- Al vender, el pedido guarda `sale_items.unit_price` (lo que pagó), `unit_list_price` (el base) y
  `sales.discount` (la bonificación neta total, `saleDiscount`). Los precios fijos no tienen auditoría por
  producto: se audita una entrada por guardado con el detalle de lo que cambió en `metadata`.

**Gotcha.** Cualquier lugar nuevo que ponga un precio a un cliente tiene que pasar por `getPricing` +
`customerPrice`. Si usás `product.price` directo, el cliente ve (y paga) un precio distinto del de su lista.

## 3. Carrito y checkout

**Qué hace.** El cliente arma un carrito (persistido en la base) y lo confirma como pedido en efectivo.

**Dónde.** `app/[lang]/(shop)/cart/`, `checkout/` (`page.tsx`, `checkout-form.tsx`, `actions.ts`),
`lib/cart.ts`, `lib/cart-queries.ts`, `lib/cart-fingerprint.ts`, `lib/checkout.ts`.

**Carrito.** `cart_items`, una fila por persona y producto, **sin auditoría**: no es dato del negocio
hasta que se confirma. Solo compra quien tiene el permiso `sales:create` (el `CLIENT`). `getCart(personId,
customerId, tx?)` devuelve los ítems con su `price` ya calculado para esa empresa, y los separa en
`available` y `unavailable` (productos pausados o borrados después de agregarlos: no entran al total).
Los totales salen de `lib/cart.ts` (`lineTotals`, `cartTotals`): el neto de cada línea se redondea a
centavos y **el IVA se calcula sobre ese neto**, así lo guardado coincide exactamente con lo mostrado.

**Checkout** (`placeOrder`, una transacción):

1. Valida el form (dirección de la **empresa** y comentario) y que la dirección esté vigente.
2. `lockAccount`: bloquea la cuenta del cliente (primer lock del orden obligatorio).
3. Relee el carrito con los precios actuales y compara su **huella** (`cartFingerprint`: producto,
   cantidad, precio, IVA, ordenados y hasheados) con la que vio el cliente. Si cambió algo, rechaza con
   "el carrito cambió" y la página muestra los precios nuevos.
4. **Vacía el carrito antes de crear el pedido**: si hubo un doble clic, el segundo `deleteMany` no
   encuentra filas y falla (`cartChanged`) en vez de duplicar.
5. Crea el pedido (`PENDING`, `CASH`) con sus ítems (`saleItemSnapshot`) y la bonificación (`cartDiscount`).
6. `audit`, `recomputeAccount` y `applyCreditCheck` (ver [crédito](#6-cuenta-corriente-y-crédito)).

**El cliente puede** cancelar un pedido `PENDING` desde "Mis pedidos". Si el admin lo habilita
(`sales.customer_can_edit`, se usa una vez), puede **modificarlo**: sus ítems vuelven a su carrito
(`sales.editing_person_id`, uno por persona) y `placeOrder` **reemplaza ese pedido** (mismo número) en vez
de crear otro. Mientras se modifica, el admin no puede cambiarle el estado.

"Mis pedidos" muestra los de **toda la empresa** (`address.customerId`); uno ajeno devuelve 404.

### Repetir pedido y favoritos

**Repetir pedido** (`repeatOrder` en `app/[lang]/(shop)/orders/actions.ts`, botón `RepeatOrderButton` en la
lista y el detalle de "Mis pedidos"): suma al carrito los productos y cantidades de un pedido de la empresa
**con los precios y la lista de hoy**: no copia nada del precio viejo. La decisión es pura
(`lib/repeat-order.ts`, `planRepeat`): lo pausado o borrado se omite y se cuenta, una cantidad fraccionaria
de un producto cuya unidad ya no admite fracciones se redondea hacia arriba, y las cantidades se
**acumulan** con lo que ya hubiera en el carrito (igual que "Agregar" en el catálogo). Redirige a
`/cart?repeated=&omitted=&from=` y el carrito muestra qué se sumó y qué no. El cliente revisa y confirma en el
checkout de siempre; un pedido ajeno devuelve "no existe".

**Favoritos** son **de la empresa**, no de la persona (`customer_favorites`, PK empresa + producto): todas
las personas del cliente ven los mismos. Como el carrito, son una preferencia y **no van a la auditoría**.

- `setFavorite` (corazón, `components/catalog/favorite-button.tsx`, actualización optimista) y
  `addFavoritesToCart` (suma **una unidad de cada favorito que no esté ya en el carrito**; lo que ya estaba
  conserva su cantidad) viven en `app/[lang]/(shop)/favorites/actions.ts`.
- El filtro `?favorites=1` es parte de `CatalogFilters` (`lib/catalog.ts`): `catalogWhere` recibe la empresa
  del usuario y, sin empresa (un admin mirando la tienda), el filtro no devuelve nada.
- **"Lo que más pedís"** (`getMostOrderedIds` en `lib/favorites-queries.ts`): los 4 productos con más pedidos
  de la empresa (`COUNT(DISTINCT pedido)`, sin cancelados ni productos no vendibles; a igualdad, el pedido
  más reciente). Solo en la portada del catálogo, sin búsqueda, categoría ni filtro de favoritos.

### Pago por transferencia

El checkout ofrece **efectivo** o **transferencia** (`paymentMethod` en `lib/checkout.ts`; sin elegir es
efectivo). La transferencia solo se ofrece si hay **datos de cobro** cargados (`transfer_settings`, una única
fila con `id = 1` y CHECKs en la migración: banco, titular, CUIT válido y CBU o alias). Los carga el admin en
`/admin/payment-settings` (permiso `payment-settings:manage`, auditado como `TRANSFER_SETTINGS`); las
validaciones son puras en `lib/transfer.ts` (`isValidCbu` con los dos dígitos verificadores, `isValidAlias`).
`placeOrder` vuelve a comprobar en el server que haya datos (`transferAvailable`) y no confía en el form.

El pedido por transferencia sigue su curso normal (no queda retenido esperando el pago): el cobro se valida
aparte. El cliente adjunta el **comprobante** al confirmar (opcional) o después desde su pedido
(`uploadTransferProof` en `(shop)/orders/actions.ts`). `canUploadProof` decide si se puede: pedido por
transferencia, no cancelado ni pagado y sin otro comprobante en revisión. El archivo se procesa y guarda
**antes** de la transacción (`lib/transfer-proof-files.ts`: imagen → WebP sin EXIF, PDF tal cual, hasta 5 MB)
y se borra si la transacción falla.

En el detalle del pedido (admin) cada comprobante pendiente tiene dos formularios (`proof-actions.ts`, permiso
`sales:manage`):

- **Validar** (`validateTransferProof`): el admin confirma monto y fecha (se sugiere lo que falta cobrar) y
  se asienta un `createCustomerPayment` por transferencia imputado al pedido, así la cuenta corriente, el crédito
  y los deudores no cambian. Orden de bloqueo: cuenta del cliente y después el comprobante (`FOR UPDATE`, que
  tiene que seguir PENDING: dos validaciones a la vez no pasan). Guarda el cobro en `payment_id`.
- **Rechazar** (`rejectTransferProof`): con un motivo (hasta 200 caracteres) que el cliente ve; puede subir otro.

Los comprobantes **no se borran** (historial del pedido) y todo se audita como `TRANSFER_PROOF`. El dashboard
avisa cuántos hay por validar y "Todos los pedidos" los filtra con `proof=1` (`transferProofs: { some: {
state: "PENDING" } }` en `lib/order-filters.ts`).

## 4. Pedido cargado por el admin

**Qué hace.** Pedidos que llegan por teléfono o WhatsApp: en `/admin/orders/new` (o desde la ficha del
cliente, con `?customer=`) el admin elige cliente y dirección, busca productos (nombre, SKU o código de
barras) y confirma. **No toca el carrito del cliente.**

**Dónde.** `app/[lang]/admin/orders/new/` (`page.tsx`, `actions.ts`), `components/orders/new-order-form.tsx`,
`lib/admin-order.ts` (`searchProducts`, `parseAdminOrder`, `saleItemSnapshot`).

**Reglas.** Permiso `sales:manage`. Usa **los precios del cliente elegido** (`getPricing`), efectivo, y
queda `PENDING` con el admin como autor (`sales.user_id`): el cliente lo ve como "La distribuidora"
(`orders.placedByDistributor`) y puede cancelarlo o pedir cambiarlo como cualquier otro. Reusa
`saleItemSnapshot` (compartido con el checkout) y el mismo orden de bloqueo; al confirmar corre también
`recomputeAccount` y `applyCreditCheck`. Las cantidades de las líneas llegan como `qty_<productId>`.

## 5. Estados del pedido y stock

**Dos máquinas de estado independientes** en `sales`:

- `SaleState` (logística): `PENDING → PREPARING → READY_TO_SHIP → OUT_FOR_DELIVERY → DELIVERED →
FINISHED`, y `CANCELED`.
- `SalePaymentState` (pago): `PENDING`, `PARTIALLY_PAID`, `PAID`, `REFUNDED`. **Se calcula** desde la
  cuenta corriente, no se edita a mano.

**Dónde.** `lib/sale-state.ts` (reglas puras), `lib/sale-state-change.ts` (`applySaleStateChange`, el
núcleo), `lib/sale-state-form.ts`, `app/[lang]/admin/orders/actions.ts` (`changeSaleState`,
`changeSalesStateBulk`), `components/orders/bulk-state-bar.tsx`.

**Reglas de transición** (`allowedTransitions`): hacia adelante (se pueden saltear pasos), **un paso
atrás** para corregir, y cancelar mientras no esté entregado. `CANCELED` es final.

**`applySaleStateChange(tx, saleId, input, userId, t)`** es lo único que cambia el estado. Lo usan el
cambio individual, el masivo (un pedido por transacción, informa el resultado de cada uno), el picking y
las hojas de ruta. Dentro de la transacción de quien llama:

1. `lockAccount` del cliente y después `SELECT ... FOR UPDATE` del pedido.
2. Rechaza si el estado ya no es el que se veía (`stale`), si el cliente lo está modificando
   (`beingEdited`) o si está **retenido por crédito** y no se cancela (`creditHold`).
3. **Efecto en el stock** (`stockEffect`): al llegar a `PREPARING` (o más adelante, si se saltearon pasos)
   se **descuenta** (`SALE`) del depósito elegido; al volver a `PENDING` o cancelar después de haberlo
   descontado se **devuelve** (`SALE_RETURN`). La devolución es el neto de los movimientos del pedido
   (`pendingReturns`), así un pedido preparado, devuelto y preparado de nuevo devuelve solo lo que falta.
   El depósito es uno para todo el pedido o uno por producto.
4. Actualiza `state`, apaga `customer_can_edit` y maneja `delivered_at` (se pone al pasar a Entregado, se
   borra si vuelve atrás; es la fecha de venta de los reportes).
5. `audit` con `before`/`after` y el comentario; `recomputeAccount` (entregar cambia la deuda).

**Stock reservado.** Los pedidos en `RESERVED_SALE_STATES` (hoy solo `PENDING`) cuentan como reservados:
`/admin/stock` muestra Reservado y Disponible = total − reservado. Desde `PREPARING` el stock ya se
descontó de verdad.

**Lotes y vencimientos.** Un producto con `tracks_expiry` lleva además su stock por lote (`stock_lots`: producto,
depósito, código y vencimiento, `quantity >= 0`); el saldo de `product_stocks` sigue siendo el total y la
diferencia es stock "sin lote". Todo pasa por el libro (`lib/stock-ledger.ts`): una salida (`SALE`, bajas,
ajustes por inventario y `TRANSFER_OUT`) se parte en tramos con `allocateFefo` (`lib/lots.ts`, puro: primero el
lote que vence antes y, a igual fecha, por código) y cada tramo es un `stock_movements` con su `lot_id`, más un
tramo sin lote si los lotes no alcanzan. `SALE_RETURN` devuelve a los lotes de donde salió ese pedido
(`saleReturnParts`, el neto de sus movimientos con lote). Una recepción trae el lote y la fecha de cada línea
(`parseReceiptLines`: filas `lot_/exp_/lq_<producto>_<n>`, hasta `MAX_LOTS_PER_LINE` lotes que suman lo que
llegó; se guardan en `goods_receipt_lots`) e ingresa a cada lote; anular el informe saca de ellos
(`reversalParts`). Las transferencias llevan cada tramo al mismo lote del depósito destino. Un ingreso a mano
de un producto con control exige lote y fecha. Una devolución de cliente vuelve a los lotes de donde salió el
pedido, descontando lo que otras notas ya devolvieron (`noteReturnParts`); darla de baja o anularla saca de
los lotes donde esa nota dejó la mercadería (`noteHeldParts`). En la lista de picking (`getSaleLots`) se ve de
qué lote sale cada producto y, con la lista abierta, `changePickingLot` → `reassignSaleLot` pasa una cantidad
de un lote a otro con dos movimientos del pedido (`SALE_RETURN` al origen y `SALE` al destino), sin cambiar el
saldo. `/admin/stock/lots` lista los lotes con stock (vencidos y
por vencer a 30 días, `expiryStatus`) y el dashboard avisa. Las fechas de lote son de calendario: se leen con
`dayOf` y se muestran con `format.day` (con `format.date` se correría un día por el huso).

**Historial.** El detalle del pedido lo arma leyendo la auditoría de ese pedido (`History` en
`app/[lang]/admin/orders/[number]/page.tsx`): estados, permisos de modificar, cambios del cliente,
retenciones y aprobaciones de crédito.

## 6. Cuenta corriente y crédito

### Cuenta corriente

**Qué es.** La deuda de un cliente **no se guarda: se calcula**. `lib/account.ts` (`summarizeAccount`, puro,
en centavos) recibe los pedidos, los cobros y las notas de crédito y devuelve el saldo y la imputación por
pedido:

- Un pedido es **deuda cuando se entrega** (`CHARGED_SALE_STATES`: `DELIVERED`, `FINISHED`).
- Lo cobrado (`customer_payments` no anulados: `PAYMENT` suma, `REFUND` resta) se imputa **al pedido más
  viejo primero**: primero a los entregados (la deuda) y, con lo que sobra, a los que todavía no se
  entregaron (pago adelantado). Los cancelados no reciben imputación.
- Las **notas de crédito** vigentes (ver abajo) bajan la deuda igual que un cobro: se suman a lo cobrado y
  se imputan de la misma manera.
- Saldo = entregado − cobrado − acreditado. Positivo, debe; negativo, saldo a favor. Un **reintegro** solo
  puede ser hasta el saldo a favor (`maxRefund`), venga de un pago de más o de una nota de crédito.

**Escritura.** `lib/account-ledger.ts`: `loadAccount` (lee pedidos y cobros y resume), `lockAccount`,
`recomputeAccount` (guarda en `sales.payment_state` y `sales.paid_at` el resultado, **en la misma
transacción**, para que listas y filtros lo usen directo) y `createCustomerPayment` (cobro o reintegro con
auditoría; lo usan la cuenta corriente, el detalle del pedido y la parada del repartidor). Los cobros se
**anulan con motivo**, nunca se borran.

**Pantallas.** `/admin/customers/[id]/account`, `/admin/debtors` (la misma cuenta, pero en SQL para todos
los clientes: `lib/debtors.ts`) y "Mis pedidos" para el cliente (ve su saldo y últimos pagos, sin
anulados ni quién los cargó).

### Notas de crédito y devoluciones

**Qué hace.** Cuando un cliente devuelve mercadería de un pedido entregado, o hay que bonificarle un
importe, el admin carga una **nota de crédito**. Baja lo que el cliente debe (o le deja saldo a favor).

**Dónde.** `lib/customer-credit.ts` (puro: `parseReturn`, `parseAdjustment`, `returnAmount`,
`remainingQuantity`), `lib/customer-credit-ledger.ts` (`createReturn`, `createAdjustment`,
`voidCreditNote`), `lib/customer-credit-queries.ts` (`returnableLines`),
`app/[lang]/admin/orders/[number]/return/` (la pantalla de devolución), las acciones de ajuste y anulación
en `app/[lang]/admin/customers/[id]/account/credit-note-actions.ts` y los componentes de
`components/account/credit-note-*.tsx`.

**Dos tipos** (`CustomerCreditNoteKind`):

- **Devolución** (`RETURN`): sale de un pedido **entregado** (desde su detalle, "Registrar devolución").
  Se eligen cantidades por producto (hasta lo entregado menos lo ya devuelto en notas vigentes), un depósito
  y un motivo. El importe es **lo que el cliente pagó en ese pedido**: `unit_price` y `unit_tax_rate` de la
  línea, con IVA (`returnAmount`), no el precio de hoy. Cada línea tiene un destino (`ReturnDestination`):
  `RESTOCK` ingresa al depósito y puede venderse otra vez; `WRITE_OFF` ingresa y se da de baja enseguida
  (vencido, roto), así el libro de stock muestra las dos patas y el saldo no cambia.
- **Ajuste** (`ADJUSTMENT`): un importe con IVA y un motivo, sin productos ni stock (desde la cuenta
  corriente del cliente).

**Reglas.**

- `createReturn` bloquea **primero la cuenta del cliente y después el pedido** y recalcula lo ya devuelto
  con esos bloqueos puestos: dos devoluciones simultáneas no pueden pasar lo entregado.
- Anular (`voidCreditNote`, con motivo) deja la nota en el historial y la saca de la cuenta. Una devolución
  **saca del depósito solo lo que había repuesto** (`CUSTOMER_RETURN_REVERSAL`); lo dado de baja no se toca,
  porque ya no estaba. El stock puede quedar negativo si lo repuesto ya se vendió: es un saldo a revisar.
- Una nota de crédito **no** cambia el pedido ni su total: el pedido sigue valiendo lo que valía y la nota
  aparece aparte, tanto en el detalle del pedido como en la cuenta corriente.
- El cliente ve sus notas vigentes en "Mi cuenta" y las devoluciones en el detalle de su pedido, **sin el
  motivo ni el destino** (son datos internos) y sin las anuladas.
- Los reportes de ventas y margen **descuentan las devoluciones** (ver [Reportes](#10-reportes)).

### Crédito

**Qué hace.** El admin puede poner a un cliente un **límite de crédito** y un **plazo de pago** (días desde
la entrega). Nada bloquea al cliente: si al confirmar un pedido supera el límite o tiene deuda vencida, el
pedido se confirma igual y queda **retenido** hasta que el admin lo apruebe o lo cancele.

**Dónde.** `lib/credit.ts` (puro: `creditExposure`, `checkCredit`, `isOnCreditHold`), `lib/credit-ledger.ts`
(`applyCreditCheck`), `releaseCreditHold` en `app/[lang]/admin/orders/actions.ts`,
`app/[lang]/admin/orders/[number]/credit-hold-control.tsx`.

**Reglas.**

- **Exposición** = lo pendiente de cobro de todos los pedidos no cancelados del cliente (entregados **y**
  abiertos), ya descontado lo pagado. Se compara con `customers.credit_limit` (null = sin límite).
- **Deuda vencida** = un pedido entregado con saldo pendiente cuyo `delivered_at` es anterior a
  `payment_term_days` días (null = no se controla).
- `applyCreditCheck(tx, ...)` corre **después** de `recomputeAccount`, con la cuenta bloqueada, al confirmar
  (tienda o admin). Si falla, guarda `credit_hold_at` y los motivos (`credit_hold_reasons`, JSON con
  `limit` y/o `overdue`). Si el pedido ya estaba retenido sin aprobar y ahora entra (porque se modificó),
  le saca la retención.
- Un pedido **retenido solo se puede cancelar** (lo exige `applySaleStateChange`) hasta que el admin lo
  aprueba con `releaseCreditHold` (guarda quién, cuándo y un comentario opcional). Aprobarlo no cambia el
  límite del cliente.
- Visibilidad: aviso en el dashboard, marca "Retenido" en la lista de pedidos y filtro `held=1`.

## 7. Picking

**Qué hace.** Antes de despachar, se arma una **lista de picking** por depósito con pedidos `PENDING`: el
sistema junta lo que hay que sacar y lo ordena por ubicación para recorrer el depósito.

**Dónde.** `/admin/picking`, `lib/picking.ts` (`pickingRoute`, `parsePicked`, `compareLocations`),
`lib/picking-queries.ts`, `components/picking/`, y las actions de `app/[lang]/admin/picking/`.

**Flujo.**

1. Se elige un conjunto de pedidos con las casillas de "Todos" o "Por zona" (`PickingFromSelection`).
2. `createPickingList`: un depósito por lista, solo pedidos `PENDING`; los pasa a `PREPARING` con
   `applySaleStateChange` (descuenta del depósito), **ordenados por cliente, todo o nada**.
3. Se prepara y se confirma (`confirmPickingList`): cada pedido pasa a `READY_TO_SHIP`. Lo que faltó o no
   se encontró se aplica con `applyShortages` (`lib/partial-delivery-ledger.ts`, compartido con la entrega
   parcial): devuelve el faltante al depósito (`SALE_RETURN`), y según el motivo da de baja (`WRITE_OFF`: roto
   o vencido) o corrige por diferencia (`recordStockCorrection`, `ADJUSTMENT`).
4. Sacar un pedido de la lista, o anular la lista, lo devuelve a `PENDING`.

**Ubicación.** `product_stocks.location` (ej. `A-03-2`), editable en `/admin/stock/[producto]`. `pickingRoute`
agrupa por producto y ordena por ubicación en **orden natural** (`A-2` antes que `A-10`), con los sin
ubicación al final.

**Lock.** Lista de picking primero, después cuenta del cliente y pedido.

## 8. Reparto

**Entidades.** `drivers` (nombre, teléfono, usuario vinculado opcional), `vehicles` (patente en
mayúsculas, capacidad opcional en kg y litros), `route_sheets` y `route_stops`. Sin borrado: se
desactivan. Validación en `lib/fleet.ts`; permiso `routes:manage`.

### Hoja de ruta

Estados (`RouteSheetState`): **Armando (`DRAFT`) → En reparto (`OUT`) → Cerrada (`CLOSED`)**.

- Se arma en `/admin/routes` (o desde "Por zona" con las casillas). Las paradas son pedidos
  `READY_TO_SHIP` **sin otra hoja abierta** (el chequeo se hace con los pedidos bloqueados). Se
  reordenan (`moveStop`) y se chequea la capacidad del vehículo (`checkCapacity`).
- **Salir** pasa todos los pedidos a `OUT_FOR_DELIVERY` con `applySaleStateChange` en **una transacción
  (todo o nada)**, ordenados por cliente. "Volver a armando" los devuelve.
- Impresión en `[number]/print`, con el **monto a cobrar por parada** (`amountsToCollect`: el pedido más
  la deuda anterior, esta última una sola vez por cliente, solo paradas pendientes).

### Carga de la entrega (celular)

`app/[lang]/delivery/` (inicio del repartidor), `[number]/[position]/` (una parada, pensada para el
celular). Puede cargarla el **repartidor vinculado** o un admin (`routes:deliver`).

- **Entregado**: firma en pantalla con aclaración, o foto del remito; cobro opcional que se asienta en la
  cuenta corriente con `createCustomerPayment`; hora y GPS si el celular los da (`lib/stop-record.ts`).
  El pedido pasa a `DELIVERED` (queda como deuda).
- **No entregado**: con motivo; el pedido vuelve a `READY_TO_SHIP` y queda libre para otra hoja cuando
  ésta se cierra.
- **Entrega parcial** (en la misma parada): `lib/partial-delivery.ts` valida cuánto se entregó y el motivo;
  `applyShortages` (dentro de la transacción, **antes** de pasar a Entregado) devuelve lo faltante al
  depósito de donde salió, da de baja lo roto o vencido, ajusta cantidades y totales del pedido
  (`discount` incluido) y audita. Lo faltante queda en `route_stops.shortages`. **Una entrega parcial no se
  deshace desde la parada.**
- Un admin puede **deshacer** una carga mientras la hoja esté en reparto.
- Firmas y fotos: `lib/delivery-files.ts` las convierte a WebP en `UPLOADS_DIR/deliveries` y se sirven
  **con sesión** por `app/media/deliveries/[file]` (las ve quien tiene `sales:read-all`; el repartidor,
  solo las de sus hojas).

### Cierre y rendición

`closeRouteSheet` (solo admin), con **todas** las paradas cargadas: se calcula lo esperado en efectivo
(`summarizeCollections`: suma de cobros en efectivo de las paradas sin anular, con la hoja bloqueada). Si lo
entregado no coincide, el **comentario es obligatorio**. Se guardan esperado, recibido, comentario y quién
cerró. Con la hoja cerrada, los pedidos no entregados quedan libres para otra.

## 9. Compras y proveedores

Todo el circuito de compra, de la orden a la deuda con el proveedor. Permiso `purchases:manage`.

**Proveedores** (`/admin/suppliers`): datos y la lista de productos que se les compra (`supplier_products`
con código del proveedor y **último costo** neto).

**Orden de compra (OC)** (`/admin/purchases`, `lib/purchase-order.ts`): estados `DRAFT → SENT →
PARTIALLY_RECEIVED / RECEIVED`, o `CANCELED` (solo sin nada recibido). Se arma por proveedor; el costo se
precarga con el último del proveedor y las líneas guardan una **foto de costo e IVA**. La cantidad
sugerida (`suggestQuantity`) es _mínimo + reservado − stock − pendiente de otras OC enviadas_, redondeada
hacia arriba si la unidad no admite decimales (usa `products.min_stock`). Hay impresión y un texto para
WhatsApp **sin precios**.

**Informe de recepción (IR)** (`/admin/receipts`, `lib/goods-receipt.ts`): se carga desde la OC. Un depósito
por informe, remito opcional, lo que llegó por producto (de más se acepta con aviso). Ingresa el stock con
`recordReceiptMovements` (`PURCHASE_RECEIPT`), suma a `received_quantity` y recalcula el estado de la OC
(`orderStateFor`). Se **anula con motivo** (`PURCHASE_RECEIPT_REVERSAL`, reabre la OC). Una OC parcialmente
recibida se puede **cerrar con faltante**. Bloqueos: OC, informe, saldos.

**Factura del proveedor** (`/admin/invoices`, `lib/supplier-invoice.ts`): se carga desde la OC con el
comprobante (tipo A/B/C, punto de venta, número; **repetido por proveedor se rechaza**), las líneas con la
alícuota de la OC, percepciones y el total impreso. `matchInvoice` hace el **control de 3 vías**: costo
distinto del de la OC, cantidad mayor a lo recibido sin facturar, o total impreso distinto del calculado.
Sin diferencias → `APPROVED`; con diferencias → `FLAGGED` hasta que un admin la apruebe con comentario.
Al aprobarse, el costo pasa a ser el último del proveedor (`updateLastCosts`) si no hay uno más nuevo; ese
costo alimenta el margen de las ventas futuras. Una factura con imputaciones vigentes no se anula.

**Cuenta corriente del proveedor** (`/admin/suppliers/[id]/account`, `/admin/supplier-debts`,
`lib/supplier-account.ts`): facturas aprobadas − órdenes de pago − notas de crédito, sin anuladas
(`summarizeSupplierAccount`, en centavos). _Vencida_ = con saldo y vencimiento anterior a hoy (sin
vencimiento, cuenta la fecha de la factura).

- **Orden de pago (OP)** (`supplier_payments` + `supplier_payment_lines`): varios medios (efectivo,
  transferencia, cheque, retención de IVA / IIBB / Ganancias). Con impresión.
- **Nota de crédito (NC)** por importe (`supplier_credit_notes`).
- Ambas se **imputan** a facturas aprobadas con saldo (`supplier_allocations`): elige el admin y
  `autoAllocate` precarga de la más vieja a la más nueva; lo que sobra queda "a cuenta" y se imputa
  después. Anular una OP o NC deja sus imputaciones sin efecto (las filas quedan).
- Todo con el proveedor bloqueado (`lockSupplier`). Orden: OC, factura, proveedor.

## 10. Reportes

`/admin/reports` (permiso `reports:read`). Ver el código en `lib/sales-report.ts` (puro) y
`lib/sales-report-queries.ts`.

- **Qué cuenta como venta** (selector): _entregados_, por `sales.delivered_at` (por defecto), o
  _confirmados sin cancelar_, por fecha del pedido.
- **Período**: desde / hasta (por defecto el mes actual, máximo un año). Los días son argentinos.
- **Cortes** (pestañas, parámetro `tab`): productos (con cantidad), categorías (con ruta completa),
  clientes, zonas (localidad) y **sin movimiento** (productos activos sin ventas en el período, con su
  stock). Totales arriba: venta neta, costo, margen, margen % y cantidad de pedidos. Gráfico de los
  últimos 12 meses (SVG hecho a mano en `components/reports/monthly-chart.tsx`, suma en SQL).
- **Margen**: contra `sale_items.unit_cost`, la **foto del último costo de compra** al hacer el pedido
  (`latestCosts` en `lib/cost-queries.ts`, el más reciente entre los proveedores del producto). Así el
  margen de un mes no se mueve cuando sube un costo. Las líneas sin costo suman a la venta pero **no al
  margen** y se informan aparte ("sin costo").
- **Devoluciones**: las notas de crédito de tipo devolución no anuladas restan como líneas `kind: "return"`
  (`getReportLines`, por la **fecha de la nota**, no la del pedido, así los meses cerrados no se mueven),
  con el precio y el costo del pedido original. `RESTOCK` revierte venta **y** costo (el margen baja solo
  por la ganancia que se pierde); `WRITE_OFF` revierte la venta pero **no el costo**: la mercadería se
  perdió y la pérdida queda en el margen (puede dar margen negativo). No suman pedidos, no cuentan como
  venta en "sin movimiento" y una devolución de un pedido de otro período también resta. Las filas, los
  totales, el gráfico y el CSV van **netos de devoluciones**; en los totales una tarjeta "Devoluciones"
  muestra lo restado.
- **CSV** en `reports/export` (mismo período y pestaña).
- Las cuentas son enteros; el margen % es el único valor en punto flotante, y solo para mostrar.

## 11. Clientes, usuarios y seguridad

**Cliente** = la empresa (CUIT validado con dígito verificador, razón social, condición de IVA, lista de
precios, descuento, límite de crédito, plazo). Tiene **personas** (cada una puede tener usuario; el mail es
el login) y **direcciones de entrega**. Dar de baja un cliente da de baja también sus personas y
direcciones (soft delete). Pantalla: `/admin/customers` y la ficha de cada cliente.

**Usuarios.** No hay registro público. El admin crea el usuario de una persona (`CLIENT` si tiene cliente,
`ADMIN` si no; los repartidores y admins internos en `/admin/users`) con una contraseña generada
(`lib/temp-password.ts`) que se muestra **una sola vez** y hay que cambiar al entrar. El admin también
blanquea, desactiva o reactiva y desbloquea el login. Un admin no se blanquea ni se desactiva a sí mismo.
Cambiar o blanquear la contraseña y desactivar **incrementan `session_version`** y con eso revocan las
sesiones abiertas.

**Defensas, en resumen** (cada una explicada en su lugar):

| Defensa                                      | Dónde                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Bloqueo de login (5 fallos mail+IP, 20 mail) | `lib/login-throttle.ts`, `login_attempts`                                                                                |
| Sesión firmada, revocable, rol desde la base | `lib/session-token.ts`, `lib/auth.ts`                                                                                    |
| Permiso en cada action y route handler       | `requirePermission` ([cap. 1](01-arquitectura.md))                                                                       |
| Pertenencia (el cliente solo ve lo suyo)     | filtros `address.customerId`, 404 en lo ajeno                                                                            |
| Auditoría inmutable                          | trigger en `audit_logs`                                                                                                  |
| Open redirect en `?next=`                    | `safeNextPath`                                                                                                           |
| Inyección de fórmulas en CSV                 | `lib/csv.ts` antepone `'` a textos que empiezan con `= + - @`                                                            |
| Cabeceras de seguridad                       | `next.config.ts` (sin iframe, nosniff, HSTS en producción; **sin CSP todavía**, el script del tema necesitaría un nonce) |
| Archivos sensibles con sesión                | `app/media/deliveries/[file]`, `app/media/transfers/[file]`                                                              |

## 12. Archivos subidos

- **Imágenes de productos**: `lib/product-image.ts` (sharp → WebP de hasta 1200 px, **sin EXIF**) en
  `UPLOADS_DIR/products`, servidas por `app/media/products/[file]`. Hasta 5 MB. Son **públicas** (sin
  sesión: son las del catálogo) y se cachean para siempre (`immutable`): cada cambio de imagen genera un
  archivo con otro nombre.
- **Firmas y fotos de remitos**: `lib/delivery-files.ts` en `UPLOADS_DIR/deliveries`. Las fotos del celular
  llegan sin achicar (hasta 8 MB); por eso las Server Actions aceptan hasta 10 MB (`bodySizeLimit` en
  `next.config.ts`).
- **Comprobantes de transferencia**: `lib/transfer-proof-files.ts` en `UPLOADS_DIR/transfers` (imagen → WebP
  sin EXIF, o PDF; hasta 5 MB). Se sirven **con sesión** por `app/media/transfers/[file]`: el admin ve
  todos; un cliente solo los de su empresa (si no, 404). Los PDF se descargan como adjunto.
- En Docker, `UPLOADS_DIR` es el volumen `uploads`. **Hay que incluirlo en los backups** (el servicio de
  backup ya lo hace).
- Los nombres son un UUID aleatorio con extensión `.webp`, generado en el server (`randomUUID`), y al
  servir se valida contra un patrón estricto (`/^[0-9a-f-]{36}\.webp$/`): un nombre con `../` o
  cualquier otra cosa devuelve 404 sin tocar el disco.

## 13. Pedidos del admin: vistas, filtros y CSV

El admin mira los pedidos de tres maneras, todas consultas por rango de fechas (no hay jobs programados):

- **Por zona** (`/admin/orders`): los pedidos del **período** (por defecto la semana de **sábado a
  viernes**, `lib/order-period.ts`, o un rango libre de hasta 93 días) sin los cancelados, **agrupados por
  localidad** (`lib/orders-by-zone.ts`, en enteros) con totales de peso, volumen, forma de pago y monto.
  La consulta es `getPeriodOrders` (`lib/orders-by-zone-queries.ts`), **compartida** con el CSV
  (`/admin/orders/export`: `;` y coma decimal en español, con BOM para Excel) y con el widget del dashboard.
- **Todos** (`/admin/orders/list`): paginado, con filtros por URL (`lib/order-filters.ts`): estados
  múltiples, pago, cliente, localidad, producto, número, fechas y "retenidos por crédito". Con un producto
  elegido, muestra cuánto se pidió de él.
- **Detalle** (`/admin/orders/[number]`): datos de entrega, ítems con foto del momento, cuenta corriente
  del cliente con cobro en el mismo lugar, cambio de estado e historial.

La vista por zona y el CSV aceptan los mismos filtros salvo número y fechas (`zoneOrderWhere`: sin estados
elegidos, **excluye los cancelados**); los campos del form son un componente compartido
(`components/orders/order-filter-fields.tsx`). Las casillas de las tablas se asocian a la barra de acciones
masivas (cambiar estado, armar picking, armar hoja de ruta) con el atributo `form` de HTML, así no hay un
`<form>` anidado.

**Dashboard** (`/admin`): resumen de la semana, contadores, pedidos retenidos por crédito y eventos de
seguridad de las últimas 24 horas (logins fallidos, bloqueados, accesos denegados) más la actividad
reciente de la auditoría. Permiso `dashboard:read`.
