# 3. Production, versions and CI/CD

This chapter explains **what is behind** the deployment. To install on a server, step by step, there is
the operational guide [`docs/en/installation.md`](../installation.md); here we explain how it is built
so that you can change it with good judgment.

## Docker images

`app/Dockerfile` has several stages (multi-stage) on `node:22-bookworm-slim`:

| Stage      | What it does                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| `base`     | Node 22 with `openssl` and certificates (Prisma needs them).                                                                |
| `deps`     | `npm ci` with `package.json`, `package-lock.json`, `prisma.config.ts` and `prisma/` (`postinstall` runs `prisma generate`). |
| `builder`  | Copies the code and runs `npm run build` (generates `.next/standalone`).                                                    |
| `migrator` | `deps` + `src/lib`. Its command applies the migrations and the seed and **exits**.                                          |
| `runner`   | The final image: only the `standalone` output, unprivileged user (`nextjs`), `HEALTHCHECK`.                                 |

Things to know:

- **Two images are published**: `ghcr.io/<repo>:<version>` (the app, `runner` stage) and
  `ghcr.io/<repo>-migrator:<version>` (`migrator` stage). Both with the same version.
- The `migrator` includes `src/lib` because the seed demo reuses the app's pure calculations (totals,
  CUIT). Everything that `prisma/seed*.ts` imports has to be there and **without the `@/` alias**
  (relative paths).
- `HEALTHCHECK` queries `GET /api/health`, which answers `200` only if the database responds
  (`SELECT 1`).
- `uploads/`, `certs/` and `backups/` **never go into the image**: they are in `.dockerignore` and in
  `outputFileTracingExcludes` of `next.config.ts` (without this, the `standalone` tracing copied the
  local uploads folder, signatures included).
- `UPLOADS_DIR=/app/uploads` is a Docker volume; the directory is created owned by `nextjs` so that
  the app can write to it.

## Docker Compose

There are two files that are combined:

### `docker-compose.yml` (base, also for development)

| Service   | What it is                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `db`      | `postgres:18-alpine`, `pgdata` volume, Argentina time zone, `healthcheck` with `pg_isready`. Publishes `POSTGRES_PORT`.       |
| `migrate` | Built with `target: migrator`. Waits for `db` to be healthy and runs migrations + seed. `restart: "no"`.                      |
| `app`     | Built with `target: runner`. Waits for `migrate` to finish successfully (`service_completed_successfully`). `uploads` volume. |

Inside Docker the `DATABASE_URL` is built by the compose from the `POSTGRES_*` variables (the one in
`.env` is not used). This way `app` never starts against an unmigrated database.

### `docker-compose.prod.yml` (added on top)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
# or, once per session:
export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
```

- **Published images** instead of building: `${APP_IMAGE}:${APP_VERSION}`. Without `APP_VERSION` the
  compose refuses to start (`:?`).
- `ports: !reset []` in `db` and `app`: they are **not published**. The app is only reachable through
  Caddy. It is a security decision: the client IP (login lock, audit) comes from `X-Forwarded-For`, and
  it is only trustworthy if Caddy replaces it.
- `caddy`: reverse proxy with HTTPS, ports 80, 443 and 443/udp. It picks the Caddyfile with `TLS_MODE`.
- `backup`: daily backups (see below).
- `caddy_data` and `caddy_config` volumes (issued certificates: **do not delete them**, Let's Encrypt
  limits how many certificates it gives per domain per week).

## HTTPS with Caddy

`app/deploy/caddy/` has one file per mode and a common one:

| File               | What it is for                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `app.caddy`        | Common: `encode zstd gzip` + `reverse_proxy app:3000`. Caddy replaces `X-Forwarded-For`.            |
| `auto.Caddyfile`   | `TLS_MODE=auto`: Caddy requests and renews the certificate by itself (Let's Encrypt / ZeroSSL).     |
| `custom.Caddyfile` | `TLS_MODE=custom`: your own or the provider's certificate, files in `app/certs/`.                   |
| `proxy.Caddyfile`  | `TLS_MODE=proxy`: the provider terminates HTTPS and HTTP arrives; it only trusts `TRUSTED_PROXIES`. |

The step by step (converting a `.pfx`, reloading without downtime, which range to put in
`TRUSTED_PROXIES`) is in the installation guide. What matters for whoever programs: **behind Caddy, the
app sees HTTP** and trusts `X-Forwarded-For`; the security headers (`next.config.ts`) include HSTS only
with `NODE_ENV=production`.

## Backups

The `backup` service (`app/deploy/backup/backup.sh`, on the Postgres image to have the same `pg_dump`)
runs once a day at `BACKUP_HOUR` (Argentina time) and leaves in `BACKUP_DIR`:

- `db-YYYYMMDD-HHMM.dump`: `pg_dump` in custom format (`pg_restore`).
- `uploads-YYYYMMDD-HHMM.tar.gz`: the volume of uploaded files.

It writes to a `.partial` and renames when done (an unfinished backup never gets the final name) and
deletes the ones older than `BACKUP_KEEP_DAYS`. A manual backup:
`docker compose exec backup sh /backup.sh now`. **The folder is on the same server**: copy it somewhere
outside (see the installation guide). Restoring = recreate the empty database, `pg_restore` and extract
`uploads`; the dump includes the migrations table.

## Updating a server

1. Backup right now.
2. Change `APP_VERSION` in `.env`.
3. `docker compose pull app migrate && docker compose up -d`.

`migrate` applies the new migrations (and the seed, which is idempotent) **before** the new app starts.
Consequence for whoever programs: **a migration has to be compatible with the previous version of the
app while the change lasts**, and a deploy has no automatic way back (migrations have no "down"). To go
back, restore the backup.

## Versions

- **release-please** (`release-please-config.json`, type `node`, package `app`) reads the Conventional
  Commits that reach `main` and keeps open a "chore(main): release X.Y.Z" PR with the changelog and
  `package.json` updated. Merging it creates the tag `vX.Y.Z` and the GitHub release.
- **Stages with continuous numbering**: ALPHA (`1.x.y-alpha`) → BETA (`1.x.y-beta`, today) → PROD (next
  major, no suffix). At every stage jump `release-as` is set in `release-please-config.json` and removed
  after the release (in a separate PR). The suffix is kept while `MAJOR.MINOR.PATCH` goes up.
- **What triggers a release**: only commits visible in the changelog that touch `app/`: `feat` (bumps
  the minor) and `fix` (bumps the patch). A lone `chore`, `docs`, `test` or `ci` does not open the
  release PR, not even with `release-as`.
- The installed version (`APP_VERSION` in `lib/version.ts`, taken from `package.json`) is shown at the
  bottom of the admin menu, only with a session.

### Conventional Commits

`type(scope): description in English, lowercase, no period`. The usual types: `feat`, `fix`, `docs`,
`refactor`, `test`, `chore`, `ci`, `perf`. They are validated by commitlint (`commit-msg` hook and CI,
which also validates the PR title, because with squash merge it is the commit that remains).

## GitHub Actions

### `ci.yml`: on every PR to `main`

| Job                    | When              | What it does                                                                                                                                                                                     |
| ---------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `changes`              | always            | Detects whether the PR touches `app/` (`dorny/paths-filter`).                                                                                                                                    |
| `conventional-commits` | always            | commitlint on the commits and the PR title.                                                                                                                                                      |
| `app-checks`           | if `app/` changes | `format:check`, `lint`, `typecheck`, `test`, migrations + seed against a Postgres, **drift check** (`prisma migrate diff --exit-code`: the schema and the migrations have to match) and `build`. |
| `docker`               | if `app/` changes | Validates the production compose and the three Caddyfiles (`caddy adapt`), builds the images, starts the stack and waits for `/api/health`.                                                      |
| `e2e`                  | if `app/` changes | Playwright with the seed demo (see [chapter 6](06-testing.md)). Uploads the report if it fails.                                                                                                  |
| `ci-ok`                | always            | Summarizes everything. **It is the only required check** to merge.                                                                                                                               |

A PR that only touches `docs/` goes through `conventional-commits` and `ci-ok`, without running the
rest.

### `release.yml`: when a PR is merged

1. `release-please` updates or creates the release PR; if the merged PR **is** the release one, it
   creates the release and the tag.
2. If a release was created, `publish-image` builds the two images and pushes them to GHCR with the
   version tag (and `latest` only if stable, without `-alpha`/`-beta`). Then it deletes the
   release-please branch.

Optional secret `RELEASE_PLEASE_TOKEN` (a PAT): with the default `GITHUB_TOKEN`, the PRs opened by
release-please do not trigger the checks; with the PAT they do.

## Time zone

Everything is Argentina (UTC−3, no daylight saving time): `TZ=America/Argentina/Buenos_Aires` in the
database, the app and the backup, and the fixed offset in `lib/order-period.ts` (`dayStart`, `isoDay`).
Dates are stored as `timestamptz` (UTC) and cut by Argentine day when building periods and reports.
