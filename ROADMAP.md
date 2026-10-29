# Roadmap Onaks System

Sistema de pedidos B2B para la distribuidora. Un PR por subfase; antes de cada fase se acuerdan las
definiciones (UX y funcionales).

Estado al 29/10/2026: fases 0 a 10 terminadas (v1.38.0-alpha). Sigue la puesta a punto para BETA y
las funciones nuevas (fases 11 a 22); facturación electrónica y app del repartidor quedan al fondo.

| Fase | Contenido                                                        | Estado      |
| ---- | ---------------------------------------------------------------- | ----------- |
| 0    | Base transversal (i18n, auditoría, menú, tema, dashboard)        | ✅          |
| 1    | Admin: datos base (categorías, depósitos, IVA, productos, stock) | ✅          |
| 2    | Admin: localidades, proveedores, clientes y usuarios             | ✅          |
| 3    | Cliente: catálogo                                                | ✅          |
| 4    | Cliente: carrito y compra                                        | ✅          |
| 5    | Admin: pedidos por zona                                          | ✅          |
| 6    | Filtros de pedidos                                               | ✅          |
| 7    | Gestión de pedidos (estados)                                     | ✅          |
| 8    | Hojas de ruta de entrega                                         | ✅          |
| 9    | Órdenes de compra a proveedores                                  | ✅          |
| 10   | Lista de picking                                                 | ✅          |
| 11   | Puesta a punto para BETA                                         | 🔄 en curso |
| 12   | Pedido cargado por el admin en nombre del cliente                | ⏳          |
| 13   | Listas de precios y descuentos                                   | ⏳          |
| 14   | Reportes de ventas y margen                                      | ⏳          |
| 15   | Avisos al cliente (mail y WhatsApp)                              | ⏳          |
| 16   | Límite de crédito y bloqueo por deuda                            | ⏳          |
| 17   | Días de entrega por zona y pedido mínimo                         | ⏳          |
| 18   | Devoluciones y notas de crédito a clientes                       | ⏳          |
| 19   | Repetir pedido y favoritos                                       | ⏳          |
| 20   | Transferencia en el checkout                                     | ⏳          |
| 21   | Lotes y vencimientos                                             | ⏳          |
| 22   | Toma de inventario desde el celular                              | ⏳          |
| 23   | Facturación electrónica (ARCA)                                   | 💤 al fondo |
| 24   | App instalable del repartidor (sin señal)                        | 💤 al fondo |

---

## Fase 0 — Base transversal ✅

| PR  | Contenido                                                     | Estado          |
| --- | ------------------------------------------------------------- | --------------- |
| 0.1 | `.gitattributes` (LF) + componentes de formulario compartidos | ✅ mergeado     |
| 0.2 | i18n es/en                                                    | ✅ v1.5.0-alpha |
| 0.3 | Auditoría y seguridad                                         | ✅ v1.6.0-alpha |
| 0.4 | Menú lateral + tema + dashboard v1                            | ✅ v1.7.0-alpha |

**Decisiones**

- **i18n:** un idioma por instalación con `APP_LOCALE` (`es` por defecto), leído en runtime. Páginas
  bajo `app/[lang]`, prerenderizadas en los dos idiomas; URLs sin prefijo (el proxy reescribe). Los datos
  y el nombre de la app ("Onaks System") no se traducen.
- **Auditoría:** `audit_logs` de solo inserción, guardado indefinido, con IP y user agent. Se registran
  CRUD (antes/después), logins (ok, fallido con motivo, bloqueado), logout, cambio de contraseña y
  accesos denegados (solo en Server Actions). Visor `/admin/audit` para cualquier ADMIN, con filtros por
  usuario, entidad, acción y fechas.
- **`created_by` / `updated_by`:** se agregan a cada tabla en la fase que la toca.
- **Login:** bloqueo de 15 min con 5 fallos por mail+IP o 20 por mail desde cualquier IP.
- **Sesiones:** `session_version`; cambiar la contraseña cierra las otras sesiones.
- **Admin:** menú lateral agrupado por secciones (Inicio · Catálogo · Clientes · Pedidos · Compras ·
  Sistema; un grupo aparece cuando tiene pantallas). En mobile, panel con ☰. Usuario y salir al pie.
- **Tema:** claro / oscuro / sistema, **sistema por defecto**, guardado por navegador.
- **Dashboard:** accesos rápidos, resumen de conteos, seguridad de las últimas 24 h y actividad
  reciente. Crece con cada fase.

---

## Fase 1 — Admin: datos base ✅

| PR  | Contenido                                                                                                             | Estado           |
| --- | --------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1.1 | Categorías (árbol + ABM)                                                                                              | ✅ v1.8.0-alpha  |
| 1.2 | Depósitos (ABM)                                                                                                       | ✅ mergeado      |
| 1.3 | Alícuotas de IVA (tabla + ABM; seed 21 / 10,5 / 27 / 0 %)                                                             | ✅ v1.10.0-alpha |
| 1.4 | Productos (ABM, precio neto + IVA, SKU, código de barras, categoría, imagen, pausado; búsqueda, filtros y paginación) | ✅ v1.11.0-alpha |
| 1.5 | Stock (saldo por producto y depósito, movimientos, ajustes y transferencias)                                          | ✅ v1.12.0-alpha |

**Decisiones**

- Precio: se carga **neto + alícuota de IVA**; el final se calcula. El IVA es una FK a la tabla de
  alícuotas; los pedidos guardan la tasa del momento.
- Producto: SKU obligatorio y único, código de barras opcional, categoría, imagen, peso en kg y volumen
  en litros, **activo / pausado** (distinto de borrar).
- Imágenes JPG/PNG/WebP hasta 5 MB, optimizadas a WebP de máx. 1200 px, en **disco del servidor**
  (volumen de Docker; entra en los backups).
- Categorías de hasta 3 niveles; los productos van solo en categorías finales (filtrar por una padre
  incluye sus subcategorías).
- Lista del admin: búsqueda (nombre/SKU/código de barras), filtro por categoría y por activo/pausado,
  paginación de 50.
- Depósito: nombre, dirección + localidad, teléfono/responsable, activo/inactivo (solo se desactiva
  sin stock).
- **Varios depósitos, stock por depósito** (total = suma). Stock como libro de movimientos
  (`stock_movements`) + saldo por producto y depósito (`product_stocks`).
- Movimientos manuales: ingreso, ajuste por inventario (se carga la cantidad contada), baja por
  rotura/vencimiento y transferencia. Comentario obligatorio en ajustes y bajas. Cantidades con hasta
  3 decimales. **El stock puede quedar negativo.**

---

## Fase 2 — Admin: localidades, proveedores, clientes y usuarios ✅

| PR  | Contenido                                                                         | Estado           |
| --- | --------------------------------------------------------------------------------- | ---------------- |
| 2.1 | Provincias y localidades (ABM)                                                    | ✅ v1.13.0-alpha |
| 2.2 | Proveedores (ABM + productos que provee)                                          | ✅ v1.14.0-alpha |
| 2.3 | Clientes, personas y direcciones de entrega                                       | ✅ v1.15.0-alpha |
| 2.4 | Usuarios (alta con contraseña generada, blanqueo, desactivar, admins, desbloqueo) | ✅ v1.16.0-alpha |

**Decisiones**

- Proveedor: datos fiscales (razón social, CUIT, condición IVA), contacto (persona, mail, teléfono),
  dirección + localidad, y productos que provee (código del proveedor + último costo neto: manual ahora,
  automático con las órdenes de compra de la fase 9).
- Cliente (empresa, CUIT) con **varias personas** (cada una puede tener usuario) y **varias direcciones
  de entrega del cliente** (cualquier persona del cliente las usa al comprar).
- Contraseña inicial **generada por el sistema y mostrada una vez** al admin; cambio obligatorio al
  primer ingreso.
- El admin puede: blanquear contraseña, desactivar/reactivar, crear otros admins, desbloquear login.
- Localidades con **ABM propio** (son las zonas de reparto).

---

## Fase 3 — Cliente: catálogo ✅ (v1.17.0-alpha)

**Decisiones**

- Tarjetas **y** lista, con selector que se recuerda por navegador.
- Cada producto: precio final + "neto + IVA x%", unidad y peso, descripción, SKU.
- El stock **no se muestra** ni oculta productos: solo se ocultan los pausados o borrados (el admin
  decide pausar por falta de stock u otra razón).
- Navegación: búsqueda (nombre/SKU/código de barras), árbol de categorías y página de detalle. Sin
  selector de orden (por nombre).

---

## Fase 4 — Cliente: carrito y compra ✅

| PR  | Contenido                                              | Estado           |
| --- | ------------------------------------------------------ | ---------------- |
| 4.1 | Carrito + marca de decimales en unidades               | ✅ v1.18.0-alpha |
| 4.2 | Confirmación de pedido, "Mis pedidos", stock reservado | ✅ v1.19.0-alpha |

**Decisiones**

- Carrito en la **base de datos** (uno por persona); los precios se recalculan al confirmar. Si cambian
  precios o el carrito entre que se muestra y se confirma, se rechaza y se pide revisar.
- Sin monto mínimo. **Solo efectivo** por ahora.
- Al confirmar: dirección de entrega de la empresa (preseleccionada si hay una sola) y comentario.
- Cantidades con decimales según la unidad ("Admite decimales": kg y l sí, u no).
- Pedido con **número correlativo**. "Mis pedidos" muestra los de **toda la empresa**.
- Confirmar **reserva** stock: reservado = pedidos **Pendientes**, visible en Stock. Se descuenta al
  pasar a "En preparación" (fase 7, eligiendo depósito).
- El admin podrá cancelar un pedido o habilitar al cliente a modificarlo (fase 7).

---

## Fase 5 — Admin: pedidos por zona ✅

| PR  | Contenido                                     | Estado           |
| --- | --------------------------------------------- | ---------------- |
| 5.1 | Pedidos por zona + detalle del pedido (admin) | ✅ v1.20.0-alpha |
| 5.2 | Impresión, CSV y widget del dashboard         | ✅ v1.21.0-alpha |

**Decisiones**

- Período: semana de **sábado a viernes** (las rutas se planifican el fin de semana), la actual por
  defecto, con flechas ← → y rango libre desde/hasta (hasta 93 días).
- Entran todos los pedidos menos los cancelados (se muestra el estado).
- Por localidad: cantidad de pedidos, peso, volumen, monto total y por forma de pago, y debajo sus
  pedidos (cliente, dirección, monto, peso) con link al detalle.
- Extras: detalle del pedido para el admin (solo lectura), vista para imprimir, CSV y widget
  "Pedidos de esta semana" en el dashboard.

---

## Fase 6 — Filtros de pedidos ✅

| PR  | Contenido                                           | Estado           |
| --- | --------------------------------------------------- | ---------------- |
| 6.1 | Lista "Todos los pedidos" con filtros               | ✅ v1.22.0-alpha |
| 6.2 | Los mismos filtros en la vista por zona y en el CSV | ✅ v1.23.0-alpha |

**Decisiones**

- Pantalla nueva "Todos los pedidos" (tabla paginada, más recientes primero) con filtros; después
  los mismos filtros se aplican a la vista por zona y al CSV.
- Filtros: estado y estado de pago (varios a la vez, incluido Cancelado), producto, cliente,
  localidad, número de pedido, forma de pago y fechas.
- Con un producto elegido, cada pedido muestra cuánto se pidió de ese producto y arriba el total del
  filtro (para saber cuánto preparar).

## Fase 7 — Gestión de pedidos ✅

| PR  | Contenido                                                                                   | Estado           |
| --- | ------------------------------------------------------------------------------------------- | ---------------- |
| 7.1 | Cambios de estado, descuento de stock al preparar e historial                               | ✅ v1.24.0-alpha |
| 7.2 | Cuenta corriente: cobros, reintegros y anulaciones (detalle del pedido y ficha del cliente) | ✅ v1.25.0-alpha |
| 7.3 | Listado de deudores y saldo a la vista del cliente                                          | ✅ v1.26.0-alpha |
| 7.4 | Cliente: cancelar pedido pendiente y modificar (volver al carrito)                          | ✅ v1.27.0-alpha |
| 7.5 | Cambio de estado masivo                                                                     | ✅ v1.28.0-alpha |

**Decisiones**

- Estados: se avanza al siguiente o se saltean pasos hacia adelante, y se puede volver **un paso**
  para corregir. Cancelar se puede hasta antes de Entregado.
- Al pasar a **En preparación** se descuenta el stock (deja de estar reservado): se elige un depósito
  para todo el pedido o uno por producto. Volver a Pendiente o cancelar después de eso devuelve el
  stock a los depósitos de donde salió.
- Habilitar al cliente a modificar: el pedido Pendiente vuelve a su carrito (se suma a lo que ya
  tenía), lo cambia y confirma de nuevo (mismo número, precios actualizados). El permiso se usa **una
  vez**; mientras el cliente modifica, el admin no le cambia el estado. El cliente también puede
  cancelar un pedido Pendiente.
- **Cuenta corriente por cliente**: un pedido es deuda al **entregarse** (si vuelve atrás, deja de
  serlo). Los cobros (monto, fecha, forma) se cargan al cliente y se imputan **solos al pedido más
  viejo**; el estado de pago de cada pedido se calcula. Se puede cobrar de más: queda **saldo a favor**
  para los próximos pedidos; devolver plata es un **reintegro** (hasta el saldo a favor). Un cobro mal
  cargado se **anula con motivo** (queda en el historial).
- Cobros desde el detalle del pedido y desde la cuenta corriente del cliente; listado de deudores; el
  cliente ve su saldo en "Mis pedidos".
- Cambio de estado masivo (p. ej. toda una zona a En reparto) e historial de cambios en el detalle.

## Fase 8 — Hojas de ruta de entrega ✅

| PR  | Contenido                                                                  | Estado           |
| --- | -------------------------------------------------------------------------- | ---------------- |
| 8.1 | Rol Repartidor, repartidores (vinculables a un usuario) y vehículos        | ✅ v1.29.0-alpha |
| 8.2 | Hoja de ruta: armado, orden de paradas, salida e impresión                 | ✅ v1.30.0-alpha |
| 8.3 | Carga por parada (celular): entrega, firma o foto, cobro, hora y ubicación | ✅ v1.31.0-alpha |
| 8.4 | Entrega parcial: ajuste del pedido y del stock                             | ✅ v1.32.0-alpha |
| 8.5 | Cierre de la hoja y rendición de efectivo                                  | ✅ v1.33.0-alpha |

**Decisiones**

- La hoja de ruta es un **reparto guardado**: fecha, repartidor, vehículo y pedidos en orden de visita.
  Estados: Armando → En reparto → Cerrada. Entran pedidos en Listo para despachar; un pedido está en
  una sola hoja abierta. Al salir, los pedidos pasan a En reparto.
- **ABM de repartidores** (nombre, teléfono) **y vehículos** (descripción, patente, capacidad en kg y
  litros): al armar la hoja se avisa si se pasa de la capacidad.
- **En cada parada** (desde el celular): entregado o **no entregado con motivo** (vuelve a Listo para
  despachar), **firma en pantalla con aclaración o foto del remito**, **cobro en el momento** (a la
  cuenta corriente), **entrega parcial** y **hora y ubicación**. Lo carga un usuario con rol nuevo
  **Repartidor** o un **Admin** (un admin puede ser también repartidor). Al cerrar la hoja, **rendición
  de efectivo** del repartidor.
- **Entrega parcial** (repartidor o admin, desde la parada): por producto, cuánto se entregó y, si falta,
  el motivo. "Vuelve al depósito" (rechazado, sobrante) devuelve el stock al depósito de donde salió;
  "Se da de baja" (roto, vencido) queda como baja en el libro. El pedido se ajusta a lo entregado (lo
  original queda en la auditoría y en la parada) y la deuda es solo por eso.
- Impresión por parada: cliente, dirección y contacto, productos y peso, **monto a cobrar** (pedido +
  deuda anterior o saldo a favor) y firma de recepción.

## Fase 9 — Compras a proveedores ✅

| PR  | Contenido                                                                          | Estado           |
| --- | ---------------------------------------------------------------------------------- | ---------------- |
| 9.1 | Stock mínimo + orden de compra (sugerencia, estados, impresión y WhatsApp)         | ✅ v1.34.0-alpha |
| 9.2 | Informe de recepción: depósito, remito, cantidades, diferencias e ingreso de stock | ✅ v1.35.0-alpha |
| 9.3 | Factura de proveedor con control de 3 vías y actualización del último costo        | ✅ v1.36.0-alpha |
| 9.4 | Cuenta corriente del proveedor: órdenes de pago y notas de crédito                 | ✅ v1.37.0-alpha |

**Decisiones**

- Circuito administrativo con comprobantes: **orden de compra (OC)** → **informe de recepción (IR)**,
  puede haber varios por OC → **factura de proveedor** → **orden de pago (OP)**, más **notas de
  crédito** del proveedor (devoluciones, diferencias).
- OC: Borrador → Enviada → Recibida parcial / Recibida; se cancela mientras no llegó nada. Se arma con
  **sugerencia**: stock mínimo + reservado − stock − lo pedido en OC sin recibir. Impresión / PDF y
  texto para WhatsApp.
- IR: un depósito por informe, remito del proveedor, cantidades recibidas y **diferencias con lo
  pedido**; el stock entra como ingreso con referencia al IR y la OC. Se puede recibir **de más** (con
  aviso). Lo que falta queda pendiente para otro IR, o el admin **cierra la OC con faltante** (con
  motivo). Un IR se **anula con motivo**: revierte el stock y lo recibido (y reabre la OC).
- Factura: **de una OC** (puede haber varias por OC), tipo A/B/C, punto de venta y número, fecha,
  vencimiento, neto, IVA, **percepciones** (IVA, IIBB, otros) y el total impreso. **Control de 3 vías**:
  costo contra la OC (exacto, al centavo), cantidad contra lo recibido sin facturar y total impreso
  contra el calculado. Sin diferencias queda **aprobada**; con diferencias, **observada** hasta que un
  admin la aprueba con comentario (solo las aprobadas se pagan). Al aprobarse actualiza el **último
  costo** del producto en ese proveedor. Se anula con motivo; un IR ya facturado no se anula.
- **Deuda con el proveedor por las facturas**: suman las facturas aprobadas (las observadas no se pagan),
  restan notas de crédito y órdenes de pago.
- OP: efectivo, transferencia, cheque (banco, número y fecha de cobro) y retenciones (IVA, IIBB,
  Ganancias, con certificado), varios medios por OP. **El admin elige qué facturas cancela** y cuánto
  (con un botón que imputa a las más viejas); lo que sobra queda a cuenta y se imputa después. Se
  imprime y se anula con motivo.
- Notas de crédito **por importe** (neto + IVA), asociadas o no a una factura; se imputan como un pago.
- Estado de cuenta por proveedor y **deuda con proveedores** (vencido, vence en 7 días, sin imputar).
- **Stock mínimo por producto** para alertar y sugerir compras.

## Fase 10 — Lista de picking ✅

| PR   | Contenido                                                                  | Estado           |
| ---- | -------------------------------------------------------------------------- | ---------------- |
| 10.1 | Listas de picking por depósito con confirmación y ubicaciones de productos | ✅ v1.38.0-alpha |

**Decisiones**

- Documento guardado (número, estado Abierta → Preparada / Anulada) armado **con los pedidos elegidos**
  en "Todos" o "Por zona" (las casillas de la barra masiva). Solo pedidos **Pendientes** y **un depósito**
  por lista: al armarla pasan a **En preparación** y se descuenta el stock de ese depósito.
- El preparador confirma lo que sacó (y quién preparó): los pedidos pasan a **Listo para despachar**. Si
  faltó algo, el pedido queda con lo preparado y el stock se corrige con motivo: **no había** (ajuste) o
  **roto o vencido** (baja). Un pedido no puede quedar vacío: se saca de la lista.
- Sacar un pedido o anular la lista lo devuelve a Pendiente (y el stock al depósito).
- **Ubicación** opcional por producto y depósito (pasillo-estante-nivel) para ordenar el recorrido;
  impresión con casillas para tildar.
- Las hojas de ruta llevan pedidos ya listos para despachar, así que no son origen de una lista.

---

## Fase 11 — Puesta a punto para BETA 🔄

| PR   | Contenido                                                              | Estado      |
| ---- | ---------------------------------------------------------------------- | ----------- |
| 11.1 | Revisión de seguridad y permisos                                       | 🟡 PR listo |
| 11.2 | Pasada de UI en celular                                                | ⏳          |
| 11.3 | Datos de demo en el seed (con una variable de entorno)                 | ⏳          |
| 11.4 | Producción: Caddy con HTTPS, backups automáticos y guía de instalación | ⏳          |
| 11.5 | Tests end-to-end con Playwright en el CI (usan los datos de demo)      | ⏳          |
| 11.6 | Salto a BETA con `release-as`                                          | ⏳          |

**Decisiones**

- Se instala en un **VPS con Docker Compose** y **Caddy** delante, que saca el certificado HTTPS solo
  (hace falta un dominio). El puerto de la app no se publica: solo entra por Caddy.
- **Backups automáticos** en el compose: `pg_dump` diario de la base y copia de `uploads` (imágenes y
  firmas), guardando los últimos días; más la guía para restaurar.
- **Datos de demo dentro del seed**, activados con una variable de entorno (distribuidora de alimentos
  para mascotas); nunca en producción.
- **Tests end-to-end**: compra del cliente; preparación y reparto (picking, hoja de ruta, parada con
  entrega parcial y cierre); compras (OC → recepción → factura → orden de pago); y permisos (un cliente o
  un repartidor no entra a pantallas ni acciones del admin).
- 11.1: todas las Server Actions verifican sesión y permiso primero; el cliente solo toca lo de su empresa
  y el repartidor sus paradas. Se sumaron cabeceras de seguridad, la neutralización de fórmulas en el
  CSV, el límite de 10 MB para fotos de celular y que un repartidor vea solo los archivos de sus hojas.
  Queda para más adelante una CSP (el script inline del tema necesita nonce).

## Fase 12 — Pedido cargado por el admin ⏳

- El admin (o un vendedor) arma un pedido en nombre de un cliente: elige cliente y dirección, carga los
  productos y confirma con la misma lógica del checkout (pedidos que llegan por teléfono o WhatsApp).

## Fase 13 — Listas de precios y descuentos ⏳

- Listas de precios (por ejemplo pet shop, veterinaria, mayorista), descuento por cliente y
  bonificaciones por cantidad. Base existente sin usar: tablas `discounts` y `used_discounts`.

## Fase 14 — Reportes de ventas y margen ⏳

- Ventas por período, cliente, producto y zona; margen contra el último costo del proveedor; productos
  que más rotan y sin movimiento; exportación a CSV.

## Fase 15 — Avisos al cliente ⏳

- Mail al confirmar, preparar, salir a reparto y entregar el pedido; botón que abre WhatsApp con el
  mensaje armado (sin API).

## Fase 16 — Límite de crédito y bloqueo por deuda ⏳

- Tope de deuda por cliente y aviso o bloqueo en el checkout si tiene deuda vencida.

## Fase 17 — Días de entrega por zona y pedido mínimo ⏳

- Días de reparto por localidad, fecha estimada de entrega en el checkout y monto mínimo opcional por zona.

## Fase 18 — Devoluciones y notas de crédito a clientes ⏳

- Devoluciones después de entregado (vencido, error): el stock vuelve y el crédito queda en la cuenta
  corriente del cliente.

## Fase 19 — Repetir pedido y favoritos ⏳

- "Repetir pedido" que carga el carrito con un pedido anterior y productos favoritos del cliente.

## Fase 20 — Transferencia en el checkout ⏳

- Pago por transferencia con comprobante adjunto; el admin lo valida y queda como cobro en la cuenta
  corriente.

## Fase 21 — Lotes y vencimientos ⏳

- Vencimiento por lote al recibir mercadería; el picking saca primero lo que vence antes.

## Fase 22 — Toma de inventario desde el celular ⏳

- Conteo por depósito con el escáner de código de barras y ajuste automático de las diferencias.

## Al fondo 💤

- **Fase 23 — Facturación electrónica (ARCA)**: factura A/B con CAE. Solo si se decide facturar desde
  este sistema (certificados y homologación).
- **Fase 24 — App instalable del repartidor**: carga de paradas sin señal y sincronización al volver.

---

## Convenciones de trabajo

- Antes de cada fase se acuerdan las definiciones.
- Commit, push y PR los hace Santiago; se entrega el título (Conventional Commits) y una descripción
  corta del PR.
- Cada PR se prueba con typecheck, lint, tests, build y una pasada en el navegador.
