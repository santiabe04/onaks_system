# 3. Producción, versiones y CI/CD

Este capítulo explica **qué hay detrás** del despliegue. Para instalar en un servidor, paso a paso, está
la guía operativa [`docs/instalacion.md`](../instalacion.md); acá se explica cómo está armado para que
puedas cambiarlo con criterio.

## Imágenes Docker

El `app/Dockerfile` tiene varias etapas (multi-stage) sobre `node:22-bookworm-slim`:

| Etapa      | Qué hace                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `base`     | Node 22 con `openssl` y certificados (Prisma los necesita).                                                                  |
| `deps`     | `npm ci` con `package.json`, `package-lock.json`, `prisma.config.ts` y `prisma/` (el `postinstall` corre `prisma generate`). |
| `builder`  | Copia el código y corre `npm run build` (genera `.next/standalone`).                                                         |
| `migrator` | `deps` + `src/lib`. Su comando aplica las migraciones y el seed y **termina**.                                               |
| `runner`   | La imagen final: solo el output `standalone`, usuario sin privilegios (`nextjs`), `HEALTHCHECK`.                             |

Cosas a saber:

- **Dos imágenes se publican**: `ghcr.io/<repo>:<versión>` (la app, etapa `runner`) y
  `ghcr.io/<repo>-migrator:<versión>` (etapa `migrator`). Las dos con la misma versión.
- El `migrator` incluye `src/lib` porque la demo del seed reusa cálculos puros de la app (totales, CUIT).
  Todo lo que importe `prisma/seed*.ts` tiene que estar ahí y **sin el alias `@/`** (rutas relativas).
- `HEALTHCHECK` consulta `GET /api/health`, que responde `200` solo si la base contesta (`SELECT 1`).
- `uploads/`, `certs/` y `backups/` **nunca van a la imagen**: están en `.dockerignore` y en
  `outputFileTracingExcludes` de `next.config.ts` (sin esto, el tracing de `standalone` copiaba la
  carpeta local de uploads, firmas incluidas).
- `UPLOADS_DIR=/app/uploads` es un volumen Docker; el directorio se crea con dueño `nextjs` para que la
  app pueda escribir.

## Docker Compose

Hay dos archivos que se suman:

### `docker-compose.yml` (base, también para desarrollo)

| Servicio  | Qué es                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `db`      | `postgres:18-alpine`, volumen `pgdata`, zona horaria de Argentina, `healthcheck` con `pg_isready`. Publica `POSTGRES_PORT`. |
| `migrate` | Construido con `target: migrator`. Espera a que `db` esté sana y corre migraciones + seed. `restart: "no"`.                 |
| `app`     | Construido con `target: runner`. Espera a que `migrate` termine bien (`service_completed_successfully`). Volumen `uploads`. |

La `DATABASE_URL` dentro de Docker la arma el compose con las `POSTGRES_*` (la del `.env` no se usa).
Así `app` nunca arranca contra una base sin migrar.

### `docker-compose.prod.yml` (se suma encima)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
# o, una vez por sesión:
export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
```

- **Imágenes publicadas** en vez de compilar: `${APP_IMAGE}:${APP_VERSION}`. Sin `APP_VERSION` el compose
  se niega a levantar (`:?`).
- `ports: !reset []` en `db` y `app`: **no se publican**. La app solo es alcanzable pasando por Caddy.
  Es una decisión de seguridad: la IP del cliente (bloqueo de login, auditoría) sale del
  `X-Forwarded-For`, y solo es confiable si lo reemplaza Caddy.
- `caddy`: proxy inverso con HTTPS, puertos 80, 443 y 443/udp. Elige el Caddyfile con `TLS_MODE`.
- `backup`: backups diarios (ver abajo).
- Volúmenes `caddy_data` y `caddy_config` (certificados emitidos: **no borrarlos**, Let's Encrypt limita
  cuántos certificados da por dominio por semana).

## HTTPS con Caddy

`app/deploy/caddy/` tiene un archivo por modo y uno común:

| Archivo            | Para qué                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `app.caddy`        | Común: `encode zstd gzip` + `reverse_proxy app:3000`. Caddy reemplaza el `X-Forwarded-For`.     |
| `auto.Caddyfile`   | `TLS_MODE=auto`: Caddy pide y renueva el certificado solo (Let's Encrypt / ZeroSSL).            |
| `custom.Caddyfile` | `TLS_MODE=custom`: certificado propio o del proveedor, archivos en `app/certs/`.                |
| `proxy.Caddyfile`  | `TLS_MODE=proxy`: el proveedor termina el HTTPS y llega HTTP; solo confía en `TRUSTED_PROXIES`. |

El paso a paso (convertir un `.pfx`, recargar sin cortar, qué rango poner en `TRUSTED_PROXIES`) está en la
guía de instalación. Lo que importa para quien programa: **detrás de Caddy, la app ve HTTP** y confía en
`X-Forwarded-For`; las cabeceras de seguridad (`next.config.ts`) incluyen HSTS solo con
`NODE_ENV=production`.

## Backups

El servicio `backup` (`app/deploy/backup/backup.sh`, sobre la imagen de Postgres para tener el mismo
`pg_dump`) corre una vez por día a `BACKUP_HOUR` (hora de Argentina) y deja en `BACKUP_DIR`:

- `db-AAAAMMDD-HHMM.dump`: `pg_dump` en formato custom (`pg_restore`).
- `uploads-AAAAMMDD-HHMM.tar.gz`: el volumen de archivos subidos.

Escribe a un `.partial` y renombra al terminar (un backup a medias nunca queda con el nombre final) y
borra los de más de `BACKUP_KEEP_DAYS`. Un backup manual: `docker compose exec backup sh /backup.sh now`.
**La carpeta está en el mismo servidor**: copiarla afuera (ver la guía de instalación). Restaurar =
recrear la base vacía, `pg_restore` y extraer `uploads`; el dump incluye la tabla de migraciones.

## Actualizar un servidor

1. Backup en el momento.
2. Cambiar `APP_VERSION` en el `.env`.
3. `docker compose pull app migrate && docker compose up -d`.

`migrate` aplica las migraciones nuevas (y el seed, que es idempotente) **antes** de que arranque la app
nueva. Consecuencia para quien programa: **una migración tiene que ser compatible con la versión anterior
de la app mientras dura el cambio**, y un deploy no tiene vuelta atrás automática (las migraciones no
tienen "down"). Para volver, restaurar el backup.

## Versiones

- **release-please** (`release-please-config.json`, tipo `node`, paquete `app`) lee los Conventional
  Commits que llegan a `main` y mantiene abierto un PR "chore(main): release X.Y.Z" con el changelog y el
  `package.json` actualizados. Al mergearlo crea el tag `vX.Y.Z` y la release de GitHub.
- **Etapas con numeración continua**: ALPHA (`1.x.y-alpha`) → BETA (`1.x.y-beta`, hoy) → PROD (siguiente
  major, sin sufijo). En cada salto de etapa se pone `release-as` en `release-please-config.json` y se
  borra después de la release (en un PR aparte). El sufijo se mantiene mientras sube
  `MAJOR.MINOR.PATCH`.
- **Qué dispara una release**: solo los commits visibles en el changelog que tocan `app/`: `feat`
  (sube el minor) y `fix` (sube el patch). Un `chore`, `docs`, `test` o `ci` solo no abre el PR de
  release, ni siquiera con `release-as`.
- La versión instalada (`APP_VERSION` en `lib/version.ts`, tomada de `package.json`) se ve al pie del
  menú del admin, solo con sesión.

### Conventional Commits

`tipo(alcance): descripción en inglés, en minúscula, sin punto`. Los tipos habituales: `feat`, `fix`,
`docs`, `refactor`, `test`, `chore`, `ci`, `perf`. Los valida commitlint (hook `commit-msg` y el CI,
que también valida el título del PR, porque con squash merge es el commit que queda).

## GitHub Actions

### `ci.yml`: en cada PR a `main`

| Job                    | Cuándo           | Qué hace                                                                                                                                                                                                  |
| ---------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changes`              | siempre          | Detecta si el PR toca `app/` (`dorny/paths-filter`).                                                                                                                                                      |
| `conventional-commits` | siempre          | commitlint sobre los commits y el título del PR.                                                                                                                                                          |
| `app-checks`           | si cambia `app/` | `format:check`, `lint`, `typecheck`, `test`, migraciones + seed contra un Postgres, **chequeo de drift** (`prisma migrate diff --exit-code`: el schema y las migraciones tienen que coincidir) y `build`. |
| `docker`               | si cambia `app/` | Valida el compose de producción y los tres Caddyfile (`caddy adapt`), construye las imágenes, levanta el stack y espera el `/api/health`.                                                                 |
| `e2e`                  | si cambia `app/` | Playwright con la demo del seed (ver el [capítulo 6](06-testing.md)). Sube el reporte si falla.                                                                                                           |
| `ci-ok`                | siempre          | Resume todo. **Es el único check requerido** para mergear.                                                                                                                                                |

Un PR que solo toca `docs/` pasa por `conventional-commits` y `ci-ok`, sin correr el resto.

### `release.yml`: al mergear un PR

1. `release-please` actualiza o crea el PR de release; si el PR mergeado **es** el de release, crea la
   release y el tag.
2. Si se creó una release, `publish-image` hace el build de las dos imágenes y las sube a GHCR con el tag
   de la versión (y `latest` solo si es estable, sin `-alpha`/`-beta`). Después borra la rama de
   release-please.

Secret opcional `RELEASE_PLEASE_TOKEN` (un PAT): con el `GITHUB_TOKEN` por defecto, los PR que abre
release-please no disparan los checks; con el PAT sí.

## Zona horaria

Todo es Argentina (UTC−3, sin horario de verano): `TZ=America/Argentina/Buenos_Aires` en la base, la app
y el backup, y el offset fijo en `lib/order-period.ts` (`dayStart`, `isoDay`). Las fechas se guardan en
`timestamptz` (UTC) y se cortan por día argentino al armar períodos y reportes.
