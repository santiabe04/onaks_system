# Roadmap Onaks System

Sistema de pedidos B2B para la distribuidora. Un PR por subfase; antes de cada fase se acuerdan las
definiciones (UX y funcionales).

Estado al 28/10/2026: fases 0 a 6 terminadas (v1.23.0-alpha); fase 7 en curso.

| Fase | Contenido                                                        | Estado       |
| ---- | ---------------------------------------------------------------- | ------------ |
| 0    | Base transversal (i18n, auditoría, menú, tema, dashboard)        | ✅           |
| 1    | Admin: datos base (categorías, depósitos, IVA, productos, stock) | ✅           |
| 2    | Admin: localidades, proveedores, clientes y usuarios             | ✅           |
| 3    | Cliente: catálogo                                                | ✅           |
| 4    | Cliente: carrito y compra                                        | ✅           |
| 5    | Admin: pedidos por zona                                          | ✅           |
| 6    | Filtros de pedidos                                               | ✅           |
| 7    | Gestión de pedidos (estados)                                     | 🔄 en curso  |
| 8    | Hojas de ruta de entrega                                         | ⏳           |
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

## Fase 7 — Gestión de pedidos 🔄

| PR  | Contenido                                                          | Estado      |
| --- | ------------------------------------------------------------------ | ----------- |
| 7.1 | Cambios de estado, descuento de stock al preparar e historial      | 🟡 PR listo |
| 7.2 | Pagos con monto (estado de pago automático)                        | ⏳          |
| 7.3 | Cliente: cancelar pedido pendiente y modificar (volver al carrito) | ⏳          |
| 7.4 | Cambio de estado masivo                                            | ⏳          |

**Decisiones**

- Estados: se avanza al siguiente o se saltean pasos hacia adelante, y se puede volver **un paso**
  para corregir. Cancelar se puede hasta antes de Entregado.
- Al pasar a **En preparación** se descuenta el stock (deja de estar reservado): se elige un depósito
  para todo el pedido o uno por producto. Volver a Pendiente o cancelar después de eso devuelve el
  stock a los depósitos de donde salió.
- Habilitar al cliente a modificar: el pedido Pendiente vuelve a su carrito, lo cambia y confirma de
  nuevo (mismo número, precios actualizados). El cliente también puede cancelar un pedido Pendiente.
- Pagos con monto, fecha y forma; el estado de pago (parcial / pagado) se calcula solo.
- Cambio de estado masivo (p. ej. toda una zona a En reparto) e historial de cambios en el detalle.

## Fase 8 — Hojas de ruta de entrega ⏳

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
