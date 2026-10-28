# Roadmap Onaks System

Sistema de pedidos B2B para la distribuidora. Un PR por subfase; antes de cada fase se acuerdan las
definiciones (UX y funcionales).

Estado al 28/10/2026: fases 0 a 7 terminadas (v1.28.0-alpha); fase 8 en curso.

| Fase | Contenido                                                        | Estado       |
| ---- | ---------------------------------------------------------------- | ------------ |
| 0    | Base transversal (i18n, auditoría, menú, tema, dashboard)        | ✅           |
| 1    | Admin: datos base (categorías, depósitos, IVA, productos, stock) | ✅           |
| 2    | Admin: localidades, proveedores, clientes y usuarios             | ✅           |
| 3    | Cliente: catálogo                                                | ✅           |
| 4    | Cliente: carrito y compra                                        | ✅           |
| 5    | Admin: pedidos por zona                                          | ✅           |
| 6    | Filtros de pedidos                                               | ✅           |
| 7    | Gestión de pedidos (estados)                                     | ✅           |
| 8    | Hojas de ruta de entrega                                         | 🔄 en curso  |
| 9    | Órdenes de compra a proveedores                                  | ⏳           |
| 10   | Lista de picking                                                 | ⏳ a debatir |

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

## Fase 8 — Hojas de ruta de entrega 🔄

| PR  | Contenido                                                                  | Estado           |
| --- | -------------------------------------------------------------------------- | ---------------- |
| 8.1 | Rol Repartidor, repartidores (vinculables a un usuario) y vehículos        | ✅ v1.29.0-alpha |
| 8.2 | Hoja de ruta: armado, orden de paradas, salida e impresión                 | ✅ v1.30.0-alpha |
| 8.3 | Carga por parada (celular): entrega, firma o foto, cobro, hora y ubicación | ✅ v1.31.0-alpha |
| 8.4 | Entrega parcial: ajuste del pedido y del stock                             | ✅ v1.32.0-alpha |
| 8.5 | Cierre de la hoja y rendición de efectivo                                  | 🟡 PR listo      |

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

## Fase 9 — Órdenes de compra a proveedores ⏳

## Fase 10 — Lista de picking ⏳ a debatir

- Productos y cantidades a sacar del depósito.
- A debatir: ¿consulta calculada, documento guardado o una por hoja de ruta?

---

## Convenciones de trabajo

- Antes de cada fase se acuerdan las definiciones.
- Commit, push y PR los hace Santiago; se entrega el título (Conventional Commits) y una descripción
  corta del PR.
- Cada PR se prueba con typecheck, lint, tests, build y una pasada en el navegador.
