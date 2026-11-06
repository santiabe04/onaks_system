# 7. Cómo programar sobre el sistema

Recetas paso a paso para los cambios más comunes, la lista de control de un PR y los errores que más se
repiten. Cada receta nombra un **archivo modelo real** del repositorio: abrilo y copiá su estructura en vez
de inventar una nueva.

## Flujo de trabajo

```bash
git switch main && git pull
git switch -c feat/lo-que-hago        # trunk-based: nunca se trabaja sobre main
cd app && npm install                 # si cambió package-lock.json
# ... programar ...
npm run format && npm run lint && npm run typecheck && npm test
git commit -m "feat(orders): add something"   # Conventional Commits, en inglés
```

Un PR = un cambio coherente, con squash merge (el título del PR es el commit). Los títulos que empiezan
con `feat` o `fix` (y tocan `app/`) generan una release; `docs`, `test`, `chore`, `ci` y `refactor` no.

## Receta 1: una pantalla nueva de administración (ABM)

**Modelo para copiar:** `app/[lang]/admin/tax-rates/` (la más simple) o `admin/price-lists/` (con detalle).

Archivos, en este orden:

1. **Schema** (`prisma/schema.prisma`) y migración. Ver la [receta 3](#receta-3-una-migración).
2. **Permiso** si hace falta uno nuevo. Ver la [receta 4](#receta-4-un-permiso-nuevo).
3. **Validación pura** en `lib/<cosa>.ts` + `lib/<cosa>.test.ts`:

   ```ts
   export type TaxRateValues = { name: string; percent: string; isActive: boolean };   // lo que tipeó
   export type TaxRateFormState = {
     errors?: Partial<Record<keyof TaxRateValues | "form", string[]>>;
     values?: TaxRateValues;                                // para volver a mostrar el form
   };

   export function validateTaxRateForm(formData: FormData, t: Messages) {
     const values = { name: get("name"), ... };
     const parsed = taxRateSchema(t).safeParse(values);     // Zod, con mensajes del diccionario
     if (parsed.success) return { ok: true as const, data: parsed.data, values };
     return { ok: false as const, state: { errors: z.flattenError(parsed.error).fieldErrors, values } };
   }
   ```

4. **`actions.ts`** (`"use server"`): `create`, `update`, `delete`. Cada una sigue la receta del
   [capítulo 1](01-arquitectura.md#3-server-actions): `requirePermission` → validar → `db.$transaction`
   con `audit(tx, ...)` → traducir errores de Prisma → `revalidatePath` + `redirect`.
5. **Form** (`<cosa>-form.tsx`, `"use client"`) con `useActionState` (ver "Formularios" en el
   [capítulo 1](01-arquitectura.md#formularios-el-detalle-que-más-hace-equivocar)). Los textos llegan por
   props (`t={t.taxRates}`).
6. **Páginas**: `page.tsx` (lista), `new/page.tsx`, `[id]/edit/page.tsx`. La forma de cada una es la del
   [capítulo 1](01-arquitectura.md#2-páginas-server-components-y-cachecomponents): carcasa estática +
   `<Suspense>` + un componente async que pide el permiso (`getUserWithPermission`) y lee la base.
   `generateMetadata` con el título del diccionario.
7. **Menú** (`app/[lang]/admin/layout.tsx`): un `{ href, label }` en la sección que corresponda, con el
   texto en `t.adminNav`.
8. **Textos** en `es.ts` **y** `en.ts` (ver la [receta 5](#receta-5-un-texto-nuevo-o-un-idioma)).
9. **Entidad de auditoría**: si es una tabla de negocio, agregá el valor al enum `AuditEntity`
   (`ALTER TYPE "AuditEntity" ADD VALUE '...'` en la migración) **y** su etiqueta en
   `audit.entities` de los dos diccionarios; si falta, `tsc` falla (el visor de auditoría y el dashboard
   indexan ese objeto con el enum).
10. **Tests**: unitarios de la validación y, si es un circuito importante, un spec e2e.
11. **Docs**: una entrada en `CLAUDE.md` y el estado en `ROADMAP.md`.

**Reglas del ABM:** nada de borrado físico de lo que tiene historia (desactivar o anular con motivo); borrar
solo lo que nunca se usó, traduciendo el error `P2003` (clave foránea en uso) a un mensaje. Mostrar el botón
"Borrar" deshabilitado con el motivo cuando ya se sabe que no se puede (`DeleteButton`, `disabledReason`).

## Receta 2: una operación de negocio con transacción

Es lo que hace un "libro": cambia datos que dependen de otros y no puede quedar a medias. Modelos para
copiar: `lib/credit-ledger.ts` (corto), `lib/stock-ledger.ts` y `lib/sale-state-change.ts` (completos).

```ts
// lib/algo-ledger.ts   ("server-only"; recibe la transacción, no abre una)
export async function hacerAlgo(tx: Prisma.TransactionClient, input, userId: string) {
  await lockAccount(tx, customerId);                       // 1. bloquear, en el orden del capítulo 4
  const [row] = await tx.$queryRaw<...>`SELECT ... FOR UPDATE`;
  if (!row) throw new AlgoError("notFound");               // 2. validar contra lo BLOQUEADO
  await tx.cosa.update({ ... });                           // 3. escribir
  await audit(tx, { action: "UPDATE", actorUserId: userId, entityType: "COSA", entityId, before, after, metadata });
  await recomputeAccount(tx, customerId);                  // 4. recalcular lo derivado
}
```

```ts
// actions.ts
try {
  await db.$transaction((tx) => hacerAlgo(tx, parsed.data, user.id));
} catch (error) {
  if (error instanceof AlgoError) return { error: t[error.code] };
  throw error; // lo inesperado se relanza
}
revalidatePath("/[lang]", "layout");
```

Reglas:

- La función de libro **recibe `tx`**: así otra operación puede llamarla dentro de su propia transacción
  (el picking llama a `applySaleStateChange`; el checkout llama a `applyCreditCheck`).
- **Una sola función cambia cada dato derivado**: el saldo de stock lo cambia solo `recordMovement`; el
  estado de un pedido, solo `applySaleStateChange`; el estado de pago, solo `recomputeAccount`. Si
  necesitás hacer lo mismo desde otro lado, **llamá a la función existente**.
- Si el cálculo es no trivial, **la decisión va en una función pura** (`lib/credit.ts`) y el libro solo
  aplica el resultado.
- Una transacción puede fallar por un deadlock si rompés el orden de bloqueo: revisá la tabla del
  [capítulo 4](04-base-de-datos.md#orden-de-bloqueo-obligatorio).

## Receta 3: una migración

```bash
# 1. Editar prisma/schema.prisma
# 2. Ver el SQL que Prisma generaría contra tu base local:
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
# 3. Crear la carpeta prisma/migrations/AAAAMMDDHHMMSS_nombre/migration.sql con ese SQL,
#    más lo que Prisma no genera (checks, backfills, triggers, valores de enum).
# 4. Aplicar y regenerar el cliente:
npm run db:deploy && npx prisma generate
# 5. Verificar que no queda drift (tiene que terminar sin diferencias):
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

(`npm run db:migrate -- --create-only --name x` hace los pasos 2-3 por vos si tenés permiso para crear la
shadow database.) Las reglas de las migraciones están en el [capítulo 4](04-base-de-datos.md#reglas).

Pensá siempre: **¿qué pasa con las filas que ya existen?** Una columna `NOT NULL` nueva se agrega nullable,
se rellena con un `UPDATE` de sentido de negocio y recién después se hace `NOT NULL`. Probalo sobre la demo
y sobre una base con pedidos reales (o al menos con los de la demo ya procesados).

Si agregás una columna que el seed o la demo insertan, **actualizá `prisma/seed-demo.ts`** (usa rutas
relativas, no el alias `@/`, porque corre en la imagen `migrator`).

## Receta 4: un permiso nuevo

1. `lib/permissions.ts`: agregar el string a `PERMISSIONS` y a `ROLE_PERMISSIONS` del rol que corresponda.
   Convención: `<recurso>:<acción>` (`price-lists:manage`, `reports:read`).
2. `lib/permissions.test.ts`: ajustar las expectativas. Tiene tests que enumeran **exactamente** los
   permisos de `CLIENT` y `DRIVER`; si agregás uno a esos roles, hay que actualizarlos a propósito.
3. Usarlo: `getUserWithPermission("...")` en la página y `requirePermission("...")` en cada action y route
   handler. **Los dos**: la página protege la vista, la action protege la operación.

## Receta 5: un texto nuevo o un idioma

1. Agregar la clave en `src/i18n/dictionaries/es.ts` (define el tipo) **y** en `en.ts` (no compila si falta).
2. Usarlo: `t.seccion.clave` con `const t = await getT()` en un Server Component; `getActionDictionary()`
   en actions y route handlers; por props en Client Components (pasar solo el pedazo que usan).
3. Con valores variables: `"Pedido {number}"` y `interpolate(t.x, { number })`.
4. Plata, números, porcentajes y fechas: **siempre** `formatters(locale)`; nada de `toLocaleString` suelto.
5. **No se traducen** los datos del negocio (productos, unidades, nombres) ni el nombre de la app.

Para agregar un idioma (hoy `es` y `en`): sumarlo a `LOCALES` y a `INTL_LOCALE` en `i18n/config.ts`, crear
el diccionario con el tipo de `es` y registrarlo en `DICTIONARIES` de `i18n/dictionary.ts`. Un `APP_LOCALE`
inválido **rompe a propósito** (no cae en el idioma por defecto) para que el error de configuración se note.

## Receta 6: una consulta o un reporte nuevo

- **Armar la consulta** en `lib/<cosa>-queries.ts` (`"server-only"`) y las cuentas en `lib/<cosa>.ts` (puro).
- Sumas de plata o cantidades: **en el SQL con `SUM(ROUND(...))`** si son muchas filas (como el gráfico de
  12 meses) o **en la app con BigInt** si son pocas (como `summarizeBy`). Nunca con `number`.
- Fechas de período: `parseOrderPeriod` / `parseReportParams` convierten `?from=&to=` a un rango
  `[start, end)` en hora argentina. Un `to` es **inclusive** en la URL y **exclusivo** en la consulta.
- **CSV**: un route handler (`route.ts`) con `requirePermission`, que reusa **la misma consulta** que la
  pantalla (así la pantalla y el archivo no se contradicen) y arma el archivo con `toCsv` / `csvNumber`
  (`;` y coma decimal en español; BOM para Excel; neutraliza fórmulas). Modelo: `admin/reports/export/route.ts`.
- Una vista imprimible: carpeta `[number]/print/` con `print:hidden` en lo que no va al papel.

## Receta 7: una pantalla del cliente

Van en `app/[lang]/(shop)/`. Diferencias con el admin:

- Permiso `catalog:read` (ver) o `sales:create` (comprar).
- **Pertenencia**: filtrar siempre por la empresa del usuario (`user.customerId`) y devolver 404, no 403, ante
  algo ajeno.
- Precios: `getPricing` + `customerPrice` (ver [módulo 2](05-modulos.md#2-precio-del-cliente-listas-y-descuentos)).
- Pensar en **celular primero**: botones grandes, tablas con scroll propio, `p-4 sm:p-8`.

## Receta 8: un spec e2e

Ver el [capítulo 6](06-testing.md#cómo-se-escribe-uno-nuevo). Resumen: un circuito por archivo, usuarios de
la demo, selectores por rol, `ready(page)` antes de tocar forms controlados, y pensar qué datos deja para
los specs que corran después (orden alfabético).

## Lista de control de un PR

- [ ] La rama sale de `main` actualizado y el título del PR es un Conventional Commit en inglés.
- [ ] `npm run format:check`, `lint`, `typecheck` y `npm test` pasan; el `build` y los e2e si tocaste rutas
      o circuitos.
- [ ] Toda action empieza con `requirePermission`; toda página con `getUserWithPermission` /
      `getCurrentUser`.
- [ ] Todo cambio de datos se audita **en la misma transacción**.
- [ ] Plata y cantidades sin `number` (BigInt o `Decimal` como string).
- [ ] Si tocás pedidos, cuenta del cliente o stock: **orden de bloqueo** respetado y la función "dueña" del
      dato usada (no un `update` suelto).
- [ ] Textos en los dos diccionarios; formatos con `formatters`.
- [ ] Una tabla nueva: migración + `AuditEntity` + etiquetas + seed/demo si corresponde; sin drift.
- [ ] Probado en celular, en tema oscuro y (si hay texto nuevo) en inglés.
- [ ] Tests unitarios de lo puro; e2e si cambia un circuito.
- [ ] `CLAUDE.md` y `ROADMAP.md` al día; este manual si cambia algo de lo que explica.

## Errores frecuentes

| Síntoma                                                                        | Causa y solución                                                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `tsc` no ve un campo nuevo de Prisma                                           | Falta `npx prisma generate` después de cambiar el schema.                                                                |
| `PageProps<"/[lang]/admin/xxx">` "no satisface la restricción"                 | La ruta es nueva: correr `npm run typecheck` (corre `next typegen`).                                                     |
| Next avisa que se lee la hora durante el prerender                             | Un `new Date()` en un Server Component: llamar `await connection()` antes.                                               |
| "Uncached data was accessed outside of `<Suspense>`"                           | La lectura de sesión, `searchParams`, `params` o la base tiene que estar dentro de un `<Suspense>`.                      |
| Un archivo `"use server"` rompe el build                                       | Solo puede exportar funciones async: constantes y tipos van a `lib/`.                                                    |
| El form pierde lo tipeado o el select vuelve a la primera opción tras un error | Form con campos controlados sin `submitWithoutReset` (ver capítulo 1).                                                   |
| El spec e2e escribe y el campo queda vacío                                     | Falta `await ready(page)`: la hidratación pisó lo tipeado.                                                               |
| Un monto aparece como `1234.5` o con decimales de más                          | Pasó por `number`: usar `format.money(...)` con el string/`Decimal` original.                                            |
| `Unique constraint failed` al crear algo                                       | Capturar `P2002` en la action y devolver el mensaje del campo (no dejar que sea un 500).                                 |
| `violates check constraint "stock_movement_direction_chk"` al mover stock      | Un tipo de movimiento nuevo que no está en ese CHECK: ver el [capítulo 4](04-base-de-datos.md#libros-de-solo-inserción). |
| Un spec e2e falla con "strict mode violation" en un label que parece único     | Next deja montada (oculta) la pantalla anterior: filtrar con `.filter({ visible: true })`.                               |
| Deadlock entre dos operaciones                                                 | Orden de bloqueo distinto: seguir la tabla del capítulo 4.                                                               |
| El seed falla en la imagen `migrator` pero anda local                          | Importa algo con el alias `@/` o algo fuera de `prisma/` y `src/lib/`.                                                   |
| Un cambio de `revalidatePath` "no se ve" en inglés                             | Usar la ruta interna con `[lang]` (`"/[lang]/admin/xxx"`), no la URL pública.                                            |
| El CI falla con "drift"                                                        | El schema y las migraciones no coinciden: correr el paso 5 de la [receta 3](#receta-3-una-migración).                    |

## Dónde seguir leyendo

- El **código de un módulo ya hecho** es la mejor documentación: elegí el más parecido a lo que vas a hacer
  (tabla en la [receta 1](#receta-1-una-pantalla-nueva-de-administración-abm)) y seguilo.
- [`ROADMAP.md`](../../ROADMAP.md) tiene el contexto y las definiciones de cada fase: por qué se decidió
  cada cosa.
- La auditoría del sistema (`/admin/audit`) es una buena forma de entender qué hace cada pantalla: probá la
  acción en la demo y mirá qué se registró.
