# 2. Development environment

## Requirements

- **Node 22** (`package.json` requires `>=22`) and npm.
- **Docker** with Compose, for the database (or your own PostgreSQL 18).
- Git. The Husky hooks are installed automatically with `npm install` (the `prepare` script).

## First run

Everything is run inside `app/`.

```bash
cd app
cp .env.example .env          # fill in SESSION_SECRET (see below)
npm install                   # also runs `prisma generate` (postinstall)
docker compose up -d db       # Postgres only, published on localhost:5432
npm run db:deploy             # apply the migrations
SEED_DEMO=true npm run db:seed  # base data + demo (see "Demo data")
npm run dev                   # http://localhost:3000
```

To generate the session secret: `openssl rand -base64 32`. It must have at least 32 characters; if it
is missing, the app fails on the first request that looks at the session (on purpose: it does not log
out silently).

### Environment variables

Next and Prisma read `app/.env` (Prisma via `dotenv` in `prisma.config.ts`).

| Variable                                                                           | What it is for                                                                                       |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                     | Postgres connection. In Docker the compose builds it from the `POSTGRES_*` variables.                |
| `SESSION_SECRET`                                                                   | Signing of the session cookie (≥ 32 characters).                                                     |
| `APP_LOCALE`                                                                       | `es` (default) or `en`. Read at runtime.                                                             |
| `UPLOADS_DIR`                                                                      | Folder for product images and signatures/photos of delivery notes (`uploads`).                       |
| `SMTP_HOST`, `SMTP_FROM`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | Optional: the mail server for customer notices. Without `SMTP_HOST` and `SMTP_FROM` nothing is sent. |
| `SEED_ADMIN_MAIL`, `SEED_ADMIN_PASSWORD`                                           | First admin created by the seed (with a mandatory password change).                                  |
| `SEED_DEMO`                                                                        | `true` loads the demo (only on a database with no products and never in production).                 |
| `POSTGRES_USER/PASSWORD/DB/PORT`                                                   | For the compose's Postgres container.                                                                |
| `APP_PORT`                                                                         | Published port of the app in the development compose.                                                |
| `APP_VERSION`, `DOMAIN`, `TLS_MODE`, ...                                           | Production only: see [chapter 3](03-production.md).                                                  |

`lib/db.ts` does **not** validate `DATABASE_URL` on import, on purpose: that way `next build` and
`prisma generate` work without a database.

## Demo data

`prisma/seed.ts` is idempotent and always loads the basics: provinces, districts of the south of
Greater Buenos Aires, units of measure, VAT rates (21 / 10.5 / 27 / 0 %) and the first admin. With
`SEED_DEMO=true` it adds `prisma/seed-demo.ts`:

- Categories, 2 warehouses and 12 products with stock (loaded as entries in the ledger) and location.
- 2 suppliers with their products and last cost (70 % of the net price).
- 2 price lists (Vets −5 %; Wholesale −10 % with one fixed price).
- 3 customers with a user: Pet Shop Patitas, Veterinaria San Roque and Mascotas Varela (the latter with
  the Wholesale list and its own 2 % discount).
- A driver with a vehicle and 4 pending orders (#1 to #4).

Users `*@demo.onaks.local` with password `demo1234` (no forced change): `admin`, `reparto`,
`patitas`, `sanroque`, `varela`. The demo only loads on a database **with no products** and fails with
`NODE_ENV=production`. The end-to-end tests depend on it.

The seed also runs in the Docker `migrator` image, which only has `prisma/` and `src/lib/`: whatever
the seed imports has to be there and without the `@/` alias (relative paths).

### Starting from scratch

```bash
docker compose down -v        # deletes the database volume (all the data!)
docker compose up -d db
npm run db:deploy && SEED_DEMO=true npm run db:seed
```

or, without touching the container, drop and create the database by hand with `psql`
(`DROP DATABASE ... WITH (FORCE)`, `CREATE DATABASE ...`) and apply migrations and seed again.
`prisma migrate reset` also works, but asks for interactive confirmation.

## Day-to-day commands

| Command                            | What it does                                                       |
| ---------------------------------- | ------------------------------------------------------------------ |
| `npm run dev`                      | Development server with Turbopack                                  |
| `npm run build` / `npm run start`  | Production build (`.next/standalone`) / serve it                   |
| `npm run typecheck`                | `next typegen` (route types) + `tsc --noEmit`                      |
| `npm run lint`                     | ESLint                                                             |
| `npm run format` / `format:check`  | Prettier (writes / only checks)                                    |
| `npm test`                         | Unit tests (Vitest)                                                |
| `npm run test:e2e`                 | Playwright (see [chapter 6](06-testing.md))                        |
| `npm run db:migrate -- --name <x>` | New migration from `schema.prisma` (`prisma migrate dev`)          |
| `npm run db:deploy`                | Apply pending migrations                                           |
| `npm run db:seed`                  | Run the seed                                                       |
| `npm run db:studio`                | Prisma Studio to look at the database                              |
| `docker compose up --build`        | Everything in containers: db + migrate (migrations and seed) + app |

## Useful tools

- **Prisma Studio** (`npm run db:studio`) or any SQL client against `localhost:5432`.
- **The audit log** (`/admin/audit`): every change with its before and after; useful to debug flows.
- **The health check**: `GET /api/health` answers `200 {"status":"ok"}` if the database responds.
- **Both languages**: change `APP_LOCALE` in `.env` and restart `npm run dev`.
- **Other users at the same time**: one private window per user (the session is a cookie).

## Git: how we work

- **Trunk-based**: `main` is always deployable. Every change goes in a short branch (`feat/...`,
  `fix/...`, `docs/...`, `chore/...`) that starts from an up-to-date `main` and comes back through a
  PR with squash merge.
- **Conventional Commits** are mandatory: the `commit-msg` hook runs commitlint. With squash, the PR
  title is the commit that remains in `main`, so the title is also validated in CI.
- The `pre-commit` hook runs `format:check` and `lint` if the commit touches `app/` (docs-only changes
  do not need them).
