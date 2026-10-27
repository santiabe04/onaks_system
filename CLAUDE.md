# Onaks System — contexto del proyecto

Sistema de pedidos B2B para una distribuidora (zona sur del GBA). Dos tipos de usuario:

- **ADMIN**: da de alta a los clientes (no hay registro público), gestiona productos y pedidos.
- **CLIENT**: entra con usuario y contraseña, ve el catálogo, arma un carrito y compra.

El admin ve los pedidos de la semana **agrupados por zona** (partido/localidad) con datos de
entrega: método de pago, peso y volumen totales, montos. La agrupación es una consulta
(`GROUP BY` ciudad + rango de fechas), no un job programado.

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
- `users.session_version` va en el token; incrementarlo revoca las sesiones (se hace al cambiar la contraseña).

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
- Soft delete con `deleted_at` en products, customers, persons, users, person_addresses.
- `sale_items` guarda una foto del producto al vender (`unit_price`, `unit_weight`, `unit_volume`, `unit_tax_rate`).
- Estados separados: `SaleState` (logística) y `SalePaymentState` (pago).
- `customers` es la empresa (CUIT, razón social, condición IVA). `persons.customer_id` es null para admins.
- Las direcciones de entrega son `person_addresses` y la zona sale de `city_id`.
- **CHECK constraints** en `app/prisma/migrations/20261023000001_checks` (Prisma no los soporta).
  Para nuevos: `npm run db:migrate -- --create-only --name <x>` y escribir el SQL a mano.
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
