# 1. Arquitectura y convenciones

## Stack

| Pieza         | Qué se usa                                                                          |
| ------------- | ----------------------------------------------------------------------------------- |
| Framework     | Next.js 16 (App Router) con `cacheComponents: true` y `output: "standalone"`        |
| UI            | React 19, Tailwind CSS 4, fuentes Geist empaquetadas (sin Google Fonts en el build) |
| Base de datos | PostgreSQL 18 (`postgres:18-alpine`)                                                |
| ORM           | Prisma 7 con el generator `prisma-client` y el adaptador `@prisma/adapter-pg`       |
| Autenticación | Propia: `bcryptjs` para contraseñas y `jose` (JWT HS256) para la cookie de sesión   |
| Validación    | Zod 4                                                                               |
| Imágenes      | `sharp` (convierte a WebP y saca los metadatos EXIF)                                |
| Mail          | `nodemailer` por SMTP, configurado con env (opcional: sin SMTP no se envía nada)    |
| Tests         | Vitest (unitarios) y Playwright (de punta a punta, Chromium)                        |
| Tooling       | npm, Node 22, ESLint, Prettier (con el plugin de Tailwind), Husky + commitlint      |
| Despliegue    | Docker Compose: Postgres, migrador, app, Caddy (HTTPS) y backups                    |

> **Ojo con Next.js 16.** Tiene cambios importantes respecto de versiones anteriores (`proxy.ts` en vez
> de `middleware.ts`, `cacheComponents`, `PageProps`/`LayoutProps` globales generados, `next/root-params`).
> Antes de usar una API que no conozcas, leé la guía en `app/node_modules/next/dist/docs/`.

## Estructura del repositorio

```
/                          raíz: solo documentación y configuración no funcional
├─ .github/workflows/      ci.yml (checks de los PR) y release.yml (versiones e imágenes)
├─ docs/                   es/ y en/: guía de instalación y este manual
├─ release-please-*.json   configuración de versionado
├─ ROADMAP.md, CLAUDE.md
└─ app/                    TODO el código: los comandos de npm se corren acá
   ├─ prisma/              schema.prisma, migrations/, seed.ts, seed-demo.ts
   ├─ src/
   │  ├─ app/              rutas (App Router)
   │  │  ├─ [lang]/        todas las páginas, prerenderizadas en es y en
   │  │  │  ├─ (shop)/     tienda del cliente: catálogo, producto, carrito, checkout, mis pedidos
   │  │  │  ├─ admin/      panel de administración (una carpeta por pantalla)
   │  │  │  ├─ delivery/   carga de entregas del repartidor (pensada para celular)
   │  │  │  ├─ login/, logout/, change-password/
   │  │  │  └─ [...rest]/  404 con el diseño de la app
   │  │  ├─ api/health/    health check (Docker y CI), sin sesión
   │  │  └─ media/         imágenes de productos (públicas) y firmas/fotos de remitos y comprobantes (con sesión)
   │  ├─ components/       componentes compartidos por dominio (orders, catalog, ui, ...)
   │  ├─ i18n/             idioma: config, diccionarios es/en, formatos
   │  ├─ lib/              lógica de negocio (pura y de servidor) y sus tests
   │  ├─ generated/prisma/ cliente de Prisma generado (no se versiona)
   │  └─ proxy.ts          filtro de cada request (sesión optimista + idioma)
   ├─ e2e/                 tests de Playwright
   ├─ deploy/              Caddyfiles y script de backup
   ├─ Dockerfile, docker-compose.yml, docker-compose.prod.yml
   └─ .husky/              hooks de git (commitlint y format/lint)
```

### `lib/`: dónde vive la lógica

`src/lib` tiene unos 140 archivos. La regla que los ordena es **separar lo puro de lo que toca la base**:

- **Puros** (`lib/cart.ts`, `lib/sale-state.ts`, `lib/account.ts`, `lib/customer-price.ts`,
  `lib/sales-report.ts`, ...): funciones sin efectos, sin Prisma ni Next. Validan forms, calculan
  totales, deciden transiciones. Se pueden importar desde Client Components (por ejemplo para mostrar
  totales en vivo) y tienen su `*.test.ts` al lado.
- **De servidor** (`*-queries.ts`, `*-ledger.ts`, `auth.ts`, `audit.ts`, `db.ts`, ...): empiezan con
  `import "server-only"` y hablan con la base. `*-queries` lee; `*-ledger` escribe dentro de una
  transacción que recibe por parámetro (`tx`), con sus bloqueos y su auditoría.

Ejemplo: el precio de un cliente se calcula en `lib/customer-price.ts` (puro, testeado) y se carga en
`lib/pricing-queries.ts` (`getPricing`, server-only), que lo usan el catálogo, el carrito y las actions.

**Plata y cantidades nunca con `number`.** Los montos viajan como string (`"1234.50"`) o como
`Prisma.Decimal`, y las cuentas se hacen en enteros con `BigInt` (centavos para plata, milésimas para
cantidades, diezmilésimas para tasas). Ver `lib/cart.ts`, `lib/price.ts`, `lib/account.ts`.

## Cómo viaja un request

```
navegador ──► proxy.ts ──► app/[lang]/... (Server Components) ──► lib/*-queries ──► Postgres
                 │                    │
                 │                    └─ <form action={serverAction}> ──► actions.ts ("use server")
                 │                                                        ├─ requirePermission(...)
                 │                                                        ├─ validar (lib puro + Zod)
                 │                                                        ├─ db.$transaction(tx => ... audit(tx))
                 │                                                        └─ revalidatePath / redirect
                 └─ sin sesión → /login?next=...
```

### 1. `proxy.ts`

Corre en cada request (salvo assets, archivos con extensión y `/api/health`). Hace dos cosas:

- **Filtro optimista de sesión** (`proxyRedirect` en `lib/routes.ts`): solo verifica la firma del JWT,
  sin tocar la base. Sin sesión → `/login?next=...` (el `next` se valida contra open redirects con
  `safeNextPath`). Con la contraseña pendiente de cambio → `/change-password`. Un no-admin que intenta
  `/admin` → su inicio (`homePathFor`: admin a `/admin`, repartidor a `/delivery`, cliente a `/`).
- **Idioma**: las URLs públicas no llevan prefijo. El proxy reescribe `/login` a `/es/login` (o `/en/...`)
  según la variable `APP_LOCALE`. Una URL que ya trae el prefijo termina en 404.

La autorización real **no** está en el proxy: está en `lib/auth.ts`, que consulta la base en cada
página y en cada action.

### 2. Páginas (Server Components) y `cacheComponents`

Con `cacheComponents: true`, todo lo que depende del request (cookies, `searchParams`, `params`, la
base) tiene que estar **dentro de un `<Suspense>`**. Por eso casi todas las páginas tienen esta forma:

```tsx
export default async function Page({ searchParams }: PageProps<"/[lang]/admin/xxx">) {
  const t = await getT();                       // texto estático: se prerenderiza
  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.xxx.title}</h1>
      <Suspense fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}>
        <Content searchParams={searchParams} />  {/* sesión, URL y DB acá adentro */}
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: Promise<...> }) {
  await getUserWithPermission("xxx:manage");    // primero el permiso
  const data = await db.xxx.findMany(...);
  ...
}
```

Si un Server Component usa la hora actual (`new Date()`, `Date.now()`), antes tiene que llamar
`await connection()` (de `next/server`); si no, Next avisa que se leyó la hora del prerender.

`PageProps<"/ruta">` y `LayoutProps<"/ruta">` son tipos globales que genera `next typegen` (lo corre
`npm run typecheck`). Una ruta nueva no tiene tipos hasta que se generan.

### 3. Server Actions

Las mutaciones son Server Actions en un `actions.ts` con `"use server"` al lado de la página. Un archivo
`"use server"` **solo puede exportar funciones async**: constantes y tipos compartidos van en `lib/`.
Toda action sigue los mismos pasos (ver `admin/tax-rates/actions.ts`, el ejemplo más simple):

1. `const user = await requirePermission("permiso")`: siempre lo primero. Una action se puede invocar
   con un POST directo, sin pasar por la página.
2. No confiar en lo que llega: los ids bindeados se validan (`isCuid`, `parseXxxId`) y el form con las
   funciones puras de `lib/` (Zod), con los mensajes del diccionario de la action
   (`getActionDictionary()`).
3. `db.$transaction(async (tx) => { ... })` con los bloqueos que correspondan, la escritura y
   `audit(tx, {...})` **dentro de la misma transacción**.
4. Errores esperables → estado del form (`{ errors, values }` o `{ error }`). Los errores de Prisma
   conocidos se traducen (`P2002` duplicado, `P2025` no existe, `P2003` en uso); el resto se relanza.
   Para cortar una transacción con un mensaje se usa una clase local (`class CheckoutError extends
Error {}`) y se atrapa afuera.
5. `revalidatePath("/[lang]/admin/xxx", "page")` (con la ruta **interna**, así cubre los dos idiomas) o
   `revalidatePath("/[lang]", "layout")` si el cambio se ve en muchas pantallas; después `redirect(...)`
   si corresponde.

Los Route Handlers (`route.ts`) se usan solo para lo que no es una página: CSV (`orders/export`,
`reports/export`), archivos (`media/...`) y el health check. También verifican el permiso con
`requirePermission`.

## Autenticación y sesión

- **Login** (`[lang]/login`): mail (en minúsculas, único) y contraseña con bcrypt. Cada intento queda en
  `login_attempts`. Con 5 fallos para el mismo mail e IP, o 20 para el mail desde cualquier IP, el login
  se bloquea 15 minutos (`lib/login-throttle.ts`). El admin puede desbloquear.
- **Cookie** `onaks_session`: JWT HS256 firmado con `SESSION_SECRET` (mínimo 32 caracteres), httpOnly,
  7 días. Lleva el id del usuario, el rol, si debe cambiar la contraseña y `sv` = `users.session_version`.
- **Revocación**: incrementar `session_version` invalida todas las sesiones de ese usuario. Se hace al
  cambiar o blanquear la contraseña y al desactivarlo.
- **No hay registro público**: el admin crea los usuarios con una contraseña temporal que se muestra una
  sola vez (`lib/temp-password.ts`) y hay que cambiar al entrar (`password_must_change`).

`lib/auth.ts` tiene cuatro funciones; usar la que corresponde:

| Función                          | Dónde                         | Qué hace                                                           |
| -------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `getCurrentUser(role?)`          | Server Components             | Usuario de la sesión (cacheado por request), opcionalmente con rol |
| `getUserWithPermission(permiso)` | Server Components             | Igual, exigiendo un permiso                                        |
| `requireUser(role?)`             | Server Actions, Route Handler | Siempre contra la base, sin caché                                  |
| `requirePermission(permiso)`     | Server Actions, Route Handler | Igual, exigiendo un permiso; si falla, audita `ACCESS_DENIED`      |

Las cuatro consultan la base: un usuario dado de baja, desactivado o con otro `session_version` queda
afuera aunque su cookie siga siendo válida (se lo manda a `/logout`, que la borra). `ACCESS_DENIED` solo
se registra desde actions: al renderizar, los prefetch de links llenarían la auditoría.

## Roles y permisos

Tres roles fijos (`UserType`): `ADMIN`, `CLIENT` y `DRIVER`. Los permisos son strings y el mapa rol →
permisos está en código, en `lib/permissions.ts` (`PERMISSIONS`, `ROLE_PERMISSIONS`, `can`). Hoy:

- **ADMIN**: todos los `*:manage`, `sales:read-all`, `catalog:read`, `audit:read`, `dashboard:read`,
  `routes:deliver` (un admin también puede repartir), `purchases:manage`, `price-lists:manage`,
  `reports:read`, `payment-settings:manage`, `stock:count` (contar el inventario desde el celular).
- **CLIENT**: `catalog:read` y `sales:create` (comprar).
- **DRIVER**: `routes:deliver` (solo las paradas de sus hojas).

Además del permiso, hay **pertenencia**: un cliente solo ve pedidos y direcciones de su empresa
(`canAccessCustomer`, y en las consultas se filtra por `address.customerId`). Un pedido ajeno da 404, no
"acceso denegado", para no revelar que existe.

## Auditoría

Todo cambio de datos se registra con `audit(tx, {...})` (`lib/audit.ts`) **dentro de la misma
transacción**: si el cambio falla no queda registro, y si el registro falla el cambio se deshace.

```ts
await audit(tx, {
  action: "UPDATE", // CREATE | UPDATE | DELETE | LOGIN_* | PASSWORD_* | ACCESS_DENIED ...
  actorUserId: user.id,
  entityType: "SALE", // enum AuditEntity: agregar el valor con una migración si es nuevo
  entityId: sale.id,
  before, // fila antes (o la parte que cambia)
  after, // fila después
  metadata: { comment }, // contexto libre (motivo, stock movido, etc.)
});
```

- Guarda IP y user agent del request (`lib/request-context.ts`: la IP sale del primer
  `x-forwarded-for`, confiable solo detrás de Caddy).
- `toAuditJson` (`lib/audit-data.ts`) saca campos sensibles: `passwordHash` nunca se guarda.
- `audit_logs` es de **solo inserción**: un trigger de la base rechaza `UPDATE`, `DELETE` y `TRUNCATE`.
  Se guarda indefinidamente. Visor en `/admin/audit` (permiso `audit:read`).
- El historial de un pedido (`/admin/orders/[number]`) se arma leyendo la auditoría de ese pedido.
- Las tablas de negocio llevan `created_by` / `updated_by` (se agregan al tocar cada tabla).

## Idiomas (i18n)

- Uno por instalación: `APP_LOCALE=es|en`, leído en runtime (no hace falta rebuildear). Español por
  defecto. Las páginas viven en `app/[lang]/` y se prerenderizan para los dos (`generateStaticParams`).
- Textos en `src/i18n/dictionaries/es.ts` y `en.ts`. **`es.ts` define el tipo**: si agregás una clave en
  `es` y no en `en`, no compila. Solo strings; los valores variables con `{x}` e `interpolate(t.x, { x })`.
- Cómo obtener los textos:
  - Server Components: `getT()` y `getLocale()` de `@/i18n/server` (leen el segmento `[lang]` con
    `next/root-params`).
  - Server Actions y Route Handlers: `getActionDictionary()` de `@/i18n/dictionary` (lee `APP_LOCALE`).
  - Client Components: reciben el pedazo del diccionario por props (`t={t.priceLists}`).
- Formatos de plata, números, porcentajes y fechas: `formatters(locale)` (`@/i18n/format`). En español,
  coma decimal y `$ 1.234,50`; ojo que entre `$` y el número va un espacio duro (no rompe línea).
- Los mensajes de Zod salen del diccionario (las funciones de validación reciben `t`).
- No se traducen los datos (productos, unidades, nombres) ni el nombre de la app (`lib/app.ts`).

## UI

- **Admin**: menú lateral por secciones definido en `app/[lang]/admin/layout.tsx` (una sección aparece si
  tiene alguna pantalla). En celular es un panel con ☰. Al pie se ve la versión instalada.
- **Tema** claro / oscuro / sistema (por defecto sistema), guardado por navegador en `localStorage`. Un
  script inline (`lib/theme.ts`) pone `data-theme` en `<html>` antes de pintar. Para estilos por tema:
  la variante `dark:` de Tailwind.
- **Celular**: las pantallas usan `p-4 sm:p-8`; toda tabla va dentro de
  `<div className="overflow-x-auto print:overflow-visible">`. Los números de comprobante, con
  `whitespace-nowrap`.
- **Impresión**: `print:hidden` en lo que no va al papel (menú, filtros, botones). En papel el tema es
  siempre claro. Hay vistas de impresión dedicadas (`[number]/print`) para hojas de ruta, OC y OP.
- Componentes base en `components/ui/`: `Field`, `Input`, `FormError`, `SubmitButton` (`form.tsx`),
  `buttonClass()` (`button.ts`), `DeleteButton` (borrar con confirmación), `PrintButton`.
- `usePathname()` devuelve la ruta interna (`/es/...`) al prerenderizar: normalizar con
  `stripLocalePrefix`.

### Formularios: el detalle que más hace equivocar

React resetea un `<form action={...}>` después de cada action. Consecuencias:

- **Forms simples** (texto, sin cálculos en vivo): `<form action={formAction}>` con
  `useActionState` y `defaultValue`. Si la action devuelve error, devuelve también `values` y el form
  los vuelve a mostrar (`state.values ?? defaultValues`). Para un `<select>` no controlado se le pone
  `key={valor}` para que tome el valor nuevo. Ejemplo: `admin/tax-rates/tax-rate-form.tsx`.
- **Forms con selects que cambian otros campos o totales en vivo**: campos **controlados** con
  `useFieldValues` y `onSubmit={submitWithoutReset(action)}` (`components/ui/use-field-values.ts`), que
  manda el form sin el reset. Si no, un error borra lo tipeado y un select controlado vuelve a su primera
  opción. Ejemplos: `components/orders/new-order-form.tsx`, `admin/price-lists/fixed-prices-form.tsx`.

## Convenciones de código

- **Idioma**: código, comentarios, nombres, commits y PRs en inglés; textos de UI en español.
- **Comentarios**: explican el porqué (una regla de negocio, un bloqueo, un caso raro), no repiten el
  código. Mirá cómo están escritos los de alrededor y seguí la misma densidad.
- **Nombres de tablas** en snake_case con `@@map`/`@map`; modelos y campos de Prisma en camelCase.
- **Sin borrado físico** de datos de negocio: soft delete (`deleted_at`), desactivar (`is_active`) o
  anular con motivo (`voided_at`/`annulled_at`). Lo que se borra de verdad es lo que nunca se usó
  (una alícuota sin productos, una lista de precios sin clientes).
- **Formato**: Prettier (con orden de clases de Tailwind) y ESLint; los corre el hook de pre-commit.
- **Commits**: Conventional Commits (commitlint). Ver el [capítulo 3](03-produccion.md#versiones).
- **Documentación**: se mantiene en dos idiomas, español en `docs/es/` e inglés en `docs/en/`, con la misma
  estructura. Cuando cambia algo de un documento, se actualizan las dos versiones en el mismo PR.
