# 2. Entorno de desarrollo

## Requisitos

- **Node 22** (el `package.json` exige `>=22`) y npm.
- **Docker** con Compose, para la base de datos (o un PostgreSQL 18 propio).
- Git. Los hooks de Husky se instalan solos con `npm install` (script `prepare`).

## Primera puesta en marcha

Todo se corre dentro de `app/`.

```bash
cd app
cp .env.example .env          # completar SESSION_SECRET (ver abajo)
npm install                   # también corre `prisma generate` (postinstall)
docker compose up -d db       # solo Postgres, publicado en localhost:5432
npm run db:deploy             # aplica las migraciones
SEED_DEMO=true npm run db:seed  # datos base + demo (ver "Datos de demo")
npm run dev                   # http://localhost:3000
```

Para generar el secreto de sesión: `openssl rand -base64 32`. Tiene que tener al menos 32 caracteres; si
falta, la app falla al primer request que mire la sesión (a propósito: no desloguea en silencio).

### Variables de entorno

Next y Prisma leen `app/.env` (Prisma vía `dotenv` en `prisma.config.ts`).

| Variable                                                                           | Para qué                                                                                                    |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                     | Conexión a Postgres. En Docker la arma el compose con las `POSTGRES_*`.                                     |
| `SESSION_SECRET`                                                                   | Firma de la cookie de sesión (≥ 32 caracteres).                                                             |
| `APP_LOCALE`                                                                       | `es` (default) o `en`. Se lee en runtime.                                                                   |
| `UPLOADS_DIR`                                                                      | Carpeta de imágenes de productos y firmas/fotos de remitos (`uploads`).                                     |
| `SMTP_HOST`, `SMTP_FROM`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | Opcionales: el servidor de mail para los avisos al cliente. Sin `SMTP_HOST` y `SMTP_FROM` no se manda nada. |
| `SEED_ADMIN_MAIL`, `SEED_ADMIN_PASSWORD`                                           | Primer admin que crea el seed (con cambio de contraseña obligatorio).                                       |
| `SEED_DEMO`                                                                        | `true` carga la demo (solo en una base sin productos y nunca en producción).                                |
| `POSTGRES_USER/PASSWORD/DB/PORT`                                                   | Para el contenedor de Postgres del compose.                                                                 |
| `APP_PORT`                                                                         | Puerto publicado de la app en el compose de desarrollo.                                                     |
| `APP_VERSION`, `DOMAIN`, `TLS_MODE`, ...                                           | Solo producción: ver el [capítulo 3](03-produccion.md).                                                     |

`lib/db.ts` **no** valida `DATABASE_URL` al importarse, a propósito: así `next build` y
`prisma generate` andan sin base de datos.

## Datos de demo

`prisma/seed.ts` es idempotente y siempre carga lo básico: provincias, partidos del sur del GBA,
unidades de medida, alícuotas de IVA (21 / 10,5 / 27 / 0 %) y el primer admin. Con `SEED_DEMO=true`
suma `prisma/seed-demo.ts`:

- Categorías, 2 depósitos y 12 productos con stock (cargado como ingresos en el libro) y ubicación.
- 2 proveedores con sus productos y último costo (70 % del precio neto).
- 2 listas de precios (Veterinarias −5 %; Mayorista −10 % con un precio fijo).
- 3 clientes con usuario: Pet Shop Patitas, Veterinaria San Roque y Mascotas Varela (este con la lista
  Mayorista y 2 % de descuento propio).
- Un repartidor con vehículo y 4 pedidos pendientes (#1 a #4).

Usuarios `*@demo.onaks.local` con contraseña `demo1234` (sin cambio obligatorio): `admin`, `reparto`,
`patitas`, `sanroque`, `varela`. La demo solo carga en una base **sin productos** y falla con
`NODE_ENV=production`. Los tests de punta a punta dependen de ella.

El seed también corre en la imagen `migrator` de Docker, que solo tiene `prisma/` y `src/lib/`: lo que
importe el seed tiene que estar ahí y sin el alias `@/` (rutas relativas).

### Empezar de cero

```bash
docker compose down -v        # borra el volumen de la base (¡todos los datos!)
docker compose up -d db
npm run db:deploy && SEED_DEMO=true npm run db:seed
```

o, sin tocar el contenedor, borrar y crear la base a mano con `psql` (`DROP DATABASE ... WITH (FORCE)`,
`CREATE DATABASE ...`) y volver a aplicar migraciones y seed. `prisma migrate reset` también sirve, pero
pide confirmación interactiva.

## Comandos del día a día

| Comando                            | Qué hace                                                           |
| ---------------------------------- | ------------------------------------------------------------------ |
| `npm run dev`                      | Servidor de desarrollo con Turbopack                               |
| `npm run build` / `npm run start`  | Build de producción (`.next/standalone`) / servirlo                |
| `npm run typecheck`                | `next typegen` (tipos de rutas) + `tsc --noEmit`                   |
| `npm run lint`                     | ESLint                                                             |
| `npm run format` / `format:check`  | Prettier (escribe / solo verifica)                                 |
| `npm test`                         | Tests unitarios (Vitest)                                           |
| `npm run test:e2e`                 | Playwright (ver [capítulo 6](06-testing.md))                       |
| `npm run db:migrate -- --name <x>` | Nueva migración a partir de `schema.prisma` (`prisma migrate dev`) |
| `npm run db:deploy`                | Aplica las migraciones pendientes                                  |
| `npm run db:seed`                  | Corre el seed                                                      |
| `npm run db:studio`                | Prisma Studio para mirar la base                                   |
| `docker compose up --build`        | Todo en contenedores: db + migrate (migraciones y seed) + app      |

## Herramientas útiles

- **Prisma Studio** (`npm run db:studio`) o cualquier cliente SQL contra `localhost:5432`.
- **La auditoría** (`/admin/audit`): cada cambio con su antes y después; sirve para depurar circuitos.
- **El health check**: `GET /api/health` responde `200 {"status":"ok"}` si la base contesta.
- **Los dos idiomas**: cambiar `APP_LOCALE` en `.env` y reiniciar `npm run dev`.
- **Otros usuarios a la vez**: una ventana privada por usuario (la sesión es una cookie).

## Git: cómo se trabaja

- **Trunk-based**: `main` siempre desplegable. Cada cambio en una rama corta (`feat/...`, `fix/...`,
  `docs/...`, `chore/...`) que sale de `main` actualizado y vuelve por PR con squash merge.
- **Conventional Commits** obligatorio: el hook `commit-msg` corre commitlint. Con squash, el título del
  PR es el commit que queda en `main`, así que el título también se valida en el CI.
- El hook `pre-commit` corre `format:check` y `lint` si el commit toca `app/` (los cambios solo de docs
  no los necesitan).
