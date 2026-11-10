# Production installation

> The Spanish version of this guide is [`docs/es/instalacion.md`](../es/instalacion.md). Both versions
> are kept in sync.

Guide to install Onaks System on a server (VPS) with Docker. Everything runs with Docker Compose: the
database, the app, **Caddy** (the proxy that provides HTTPS) and an **automatic backup** service.
Commands are run inside the repository's `app/` folder.

## Requirements

- A Linux VPS with at least 2 GB of RAM and Docker with the Compose plugin
  (`docker compose version`).
- A domain or subdomain pointing to the server's IP (an **A** record, and **AAAA** if it has IPv6).
- Ports **80** and **443** open in the server's and the provider's firewall. No other needs to be
  opened: the database and the app are not published, the only way in is through Caddy.

## First installation

1. Download the repository (or just the `app/` folder) on the server and enter `app/`.
2. Create the `.env` from the example and fill it in:

   ```bash
   cp .env.example .env
   ```

   | Variable                          | What to put                                                                                                           |
   | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
   | `SESSION_SECRET`                  | A long random key: `openssl rand -base64 32`                                                                          |
   | `SEED_ADMIN_MAIL`                 | The first administrator's email                                                                                       |
   | `SEED_ADMIN_PASSWORD`             | Their initial password (they are asked to change it on login)                                                         |
   | `SEED_DEMO`                       | `false` (the demo data is only for trying things out)                                                                 |
   | `POSTGRES_PASSWORD`               | A long random password for the database                                                                               |
   | `APP_VERSION`                     | The version to install, for example `1.40.0-beta` (see the releases)                                                  |
   | `DOMAIN`                          | The domain, without `https://`                                                                                        |
   | `ACME_EMAIL`                      | An email for the certificate notices                                                                                  |
   | `TLS_MODE`                        | `auto`, `custom` or `proxy` (see [HTTPS certificate](#https-certificate))                                             |
   | `APP_LOCALE`                      | `es` or `en`                                                                                                          |
   | `SMTP_HOST`, `SMTP_FROM`          | Optional: the mail server and sender used to notify customers about their order (see [Email notices](#email-notices)) |
   | `BACKUP_KEEP_DAYS`, `BACKUP_HOUR` | How many days backups are kept and at what hour they are made (default 14 and 3)                                      |

   The `.env` `DATABASE_URL` is not used in Docker (the compose builds its own from `POSTGRES_*`).

3. If the repository's images are private, log in to GHCR with a token that has the `read:packages`
   permission:

   ```bash
   echo "<token>" | docker login ghcr.io -u <user> --password-stdin
   ```

4. Start everything:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

   The `migrate` service applies the migrations and the seed (provinces, districts, units, tax rates
   and the first admin) and exits; then the app, Caddy and the backups start.

5. Go to `https://<DOMAIN>` with the admin from the `.env` and change the password.

To avoid repeating the `-f` flags in every command, you can define, in the server session:

```bash
export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
```

The commands in this guide assume it and only use `docker compose ...`.

## HTTPS certificate

It is chosen with `TLS_MODE` in the `.env`. To change mode: edit the `.env` and run
`docker compose up -d caddy`.

### `auto` (recommended)

Caddy requests the certificate from Let's Encrypt (or from ZeroSSL if that fails), stores it in the
`caddy_data` volume and renews it by itself before it expires. All that is needed is that `DOMAIN`
points to the server and that ports 80 and 443 are open. HTTP redirects to HTTPS. It is a certificate
validated by a certificate authority like any other: browsers accept it just like a paid one.

Do not delete the `caddy_data` volume: if it is lost, Caddy requests the certificate again and Let's
Encrypt limits how many are issued per week for the same domain.

### `custom` (your own or the provider's certificate)

For a purchased certificate (for example with organization validation) or one that the provider
delivers as files. They go in `app/certs/` (not versioned) in **PEM** format:

- `certs/fullchain.pem`: the domain's certificate **followed by the intermediates** (the full chain; if
  the intermediates are missing, some phones show it as invalid).
- `certs/privkey.pem`: the private key.

Depending on how they are delivered:

```bash
# .crt + .ca-bundle (or "intermediate"): concatenate them, the domain's first.
cat domain.crt domain.ca-bundle > certs/fullchain.pem
cp domain.key certs/privkey.pem

# .pfx / .p12 (asks for the file's password):
openssl pkcs12 -in certificate.pfx -nokeys -out certs/fullchain.pem
openssl pkcs12 -in certificate.pfx -nocerts -nodes -out certs/privkey.pem

# See who it is for and until when:
openssl x509 -in certs/fullchain.pem -noout -subject -issuer -enddate
```

Protect the key: `chmod 600 certs/privkey.pem`.

**Renewal**: Caddy does not renew your own certificate. Before it expires (usually every year), replace
the two files and reload Caddy without interrupting the service:

```bash
docker compose exec caddy caddy reload --config /etc/caddy/custom.Caddyfile --adapter caddyfile --force
```

### `proxy` (the provider terminates HTTPS)

Some providers put their own proxy or load balancer in front of the server: they handle HTTPS and
traffic arrives over HTTP. In that case Caddy does not handle certificates, listens on port 80 and
trusts the provider's proxy to know each user's real IP (used by the login lock and the audit log).

- `TRUSTED_PROXIES`: the IPs or ranges of the provider's proxy, separated by spaces. The default is
  `private_ranges` (private networks), which is enough when the proxy arrives through the internal
  network. If the provider publishes its ranges, it is best to put them.
- It is not necessary to open 443 on the server; 80 should only accept connections from the provider's
  proxy.

If the provider only gives its own subdomain (like `server.provider.com`) pointing to the VPS, that is
`auto` mode.

## Backups

The `backup` service makes one per day at `BACKUP_HOUR` (Argentina time) and leaves in `BACKUP_DIR`
(default `app/backups/`):

- `db-YYYYMMDD-HHMM.dump`: the whole database (`pg_dump` in custom format).
- `uploads-YYYYMMDD-HHMM.tar.gz`: product images, signatures and delivery note photos.

It deletes the ones older than `BACKUP_KEEP_DAYS` days. To make one right now (for example before
updating):

```bash
docker compose exec backup sh /backup.sh now
```

**Important**: that folder is on the same server. If the server is lost, the backups are lost. It has
to be copied somewhere else regularly (another server, a bucket, Google Drive with `rclone`, etc.).
Example with a server cron job that syncs it every night:

```bash
30 4 * * * rsync -a --delete /path/to/app/backups/ user@other-server:/backups/onaks/
```

### Restoring

With the app stopped, the empty database is recreated, the dump is loaded and the files are put back:

```bash
docker compose stop app caddy

# 1. Database: it is dropped and recreated empty, and the backup is loaded.
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < backups/db-YYYYMMDD-HHMM.dump

# 2. Files: extracted onto the uploads volume.
docker run --rm -v onaks_system_uploads:/uploads -v "$PWD/backups:/backups:ro" \
  postgres:18-alpine tar -xzf /backups/uploads-YYYYMMDD-HHMM.tar.gz -C /uploads

docker compose up -d
```

The dump includes the migrations table: on startup, `migrate` does not reapply anything. If the backup
is from an earlier version, `migrate` applies the missing migrations.

## Updating to a new version

1. Make a backup right now (see above).
2. Change `APP_VERSION` in the `.env`.
3. Pull the images and restart:

   ```bash
   docker compose pull app migrate
   docker compose up -d
   ```

   `migrate` applies the new migrations before the app starts.

## Useful commands

```bash
docker compose ps                    # status of the services
docker compose logs -f app           # app logs
docker compose logs caddy            # certificate problems
docker compose exec backup ls -lh /backups
```

## Security

- The database and the app publish no ports: the app can only be reached through Caddy. This way
  nobody can send a fake IP in `X-Forwarded-For` to bypass the login lock or pollute the audit log.
- Long random `SESSION_SECRET` and `POSTGRES_PASSWORD`; the `.env` and `certs/` are neither shared nor
  versioned.
- The server firewall with only 22 (SSH), 80 and 443 open.

## Email notices

The app emails the customer when their order is confirmed, prepared, sent out for delivery and
delivered. For that it needs an SMTP server (the hosting's, Gmail with an app password, Brevo, etc.).
In the `.env`:

```bash
SMTP_HOST=smtp.mydistributor.com
SMTP_PORT=587
SMTP_USER=orders@mydistributor.com
SMTP_PASSWORD=the-password
SMTP_FROM="My Distributor <orders@mydistributor.com>"
```

Port 465 uses direct TLS; on the others STARTTLS is negotiated (it can be forced with
`SMTP_SECURE=true` or `false`). Without `SMTP_HOST` and `SMTP_FROM` the app works the same and sends no
emails. Restart the app after changing them. In each order's detail the admin sees what was sent, if
anything failed (with the reason) and can retry it; there is also a button to notify through WhatsApp.
