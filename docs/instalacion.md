# Instalación en producción

Guía para instalar Onaks System en un servidor (VPS) con Docker. Todo corre con Docker Compose: la base
de datos, la app, **Caddy** (el proxy que da HTTPS) y un servicio de **backups automáticos**. Los
comandos se corren dentro de la carpeta `app/` del repositorio.

## Requisitos

- Un VPS con Linux, 2 GB de RAM como mínimo y Docker con el plugin Compose (`docker compose version`).
- Un dominio o subdominio que apunte a la IP del servidor (registro **A**, y **AAAA** si tiene IPv6).
- Los puertos **80** y **443** abiertos en el firewall del servidor y del proveedor. No hace falta abrir
  ningún otro: la base y la app no se publican, solo se entra por Caddy.

## Primera instalación

1. Bajar el repositorio (o solo la carpeta `app/`) en el servidor y entrar a `app/`.
2. Crear el `.env` a partir del ejemplo y completarlo:

   ```bash
   cp .env.example .env
   ```

   | Variable                          | Qué poner                                                                      |
   | --------------------------------- | ------------------------------------------------------------------------------ |
   | `SESSION_SECRET`                  | Una clave larga al azar: `openssl rand -base64 32`                             |
   | `SEED_ADMIN_MAIL`                 | El mail del primer administrador                                               |
   | `SEED_ADMIN_PASSWORD`             | Su contraseña inicial (se pide cambiarla al entrar)                            |
   | `SEED_DEMO`                       | `false` (los datos de demo son solo para probar)                               |
   | `POSTGRES_PASSWORD`               | Una contraseña larga al azar para la base                                      |
   | `APP_VERSION`                     | La versión a instalar, por ejemplo `1.40.0-beta` (ver las releases)            |
   | `DOMAIN`                          | El dominio, sin `https://`                                                     |
   | `ACME_EMAIL`                      | Un mail para los avisos del certificado                                        |
   | `TLS_MODE`                        | `auto`, `custom` o `proxy` (ver [Certificado HTTPS](#certificado-https))       |
   | `APP_LOCALE`                      | `es` o `en`                                                                    |
   | `BACKUP_KEEP_DAYS`, `BACKUP_HOUR` | Cuántos días se guardan los backups y a qué hora se hacen (por defecto 14 y 3) |

   La `DATABASE_URL` del `.env` no se usa en Docker (el compose arma la suya con `POSTGRES_*`).

3. Si las imágenes del repositorio son privadas, iniciar sesión en GHCR con un token con permiso
   `read:packages`:

   ```bash
   echo "<token>" | docker login ghcr.io -u <usuario> --password-stdin
   ```

4. Levantar todo:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

   El servicio `migrate` aplica las migraciones y el seed (provincias, partidos, unidades, alícuotas y
   el primer admin) y termina; después arrancan la app, Caddy y los backups.

5. Entrar a `https://<DOMAIN>` con el admin del `.env` y cambiar la contraseña.

Para no repetir los `-f` en cada comando se puede definir, en la sesión del servidor:

```bash
export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
```

Los comandos de esta guía lo dan por hecho y usan solo `docker compose ...`.

## Certificado HTTPS

Se elige con `TLS_MODE` en el `.env`. Para cambiar de modo: editar el `.env` y correr
`docker compose up -d caddy`.

### `auto` (recomendado)

Caddy pide el certificado a Let's Encrypt (o a ZeroSSL si falla), lo guarda en el volumen `caddy_data` y
lo renueva solo antes de que venza. Solo hace falta que `DOMAIN` apunte al servidor y que los puertos 80 y
443 estén abiertos. HTTP redirige a HTTPS. Es un certificado validado por una entidad certificante como
cualquier otro: los navegadores lo aceptan igual que uno pago.

No borrar el volumen `caddy_data`: si se pierde, Caddy vuelve a pedir el certificado y Let's Encrypt
limita cuántos se emiten por semana para un mismo dominio.

### `custom` (certificado propio o del proveedor)

Para un certificado comprado (por ejemplo con validación de organización) o que entrega el proveedor
como archivos. Van en `app/certs/` (no se versiona) en formato **PEM**:

- `certs/fullchain.pem`: el certificado del dominio **seguido de los intermedios** (la cadena completa;
  si faltan los intermedios, algunos celulares lo muestran como inválido).
- `certs/privkey.pem`: la clave privada.

Según cómo lo entreguen:

```bash
# .crt + .ca-bundle (o "intermediate"): se concatenan, primero el del dominio.
cat dominio.crt dominio.ca-bundle > certs/fullchain.pem
cp dominio.key certs/privkey.pem

# .pfx / .p12 (pide la contraseña del archivo):
openssl pkcs12 -in certificado.pfx -nokeys -out certs/fullchain.pem
openssl pkcs12 -in certificado.pfx -nocerts -nodes -out certs/privkey.pem

# Ver a quién y hasta cuándo es:
openssl x509 -in certs/fullchain.pem -noout -subject -issuer -enddate
```

Proteger la clave: `chmod 600 certs/privkey.pem`.

**Renovación**: Caddy no renueva un certificado propio. Antes de que venza (en general cada año), se
reemplazan los dos archivos y se recarga Caddy sin cortar el servicio:

```bash
docker compose exec caddy caddy reload --config /etc/caddy/custom.Caddyfile --adapter caddyfile --force
```

### `proxy` (el proveedor termina el HTTPS)

Algunos proveedores ponen su propio proxy o balanceador delante del servidor: el HTTPS lo resuelven
ellos y el tráfico llega por HTTP. En ese caso Caddy no maneja certificados, escucha en el puerto 80 y
confía en el proxy del proveedor para saber la IP real de cada usuario (la usa el bloqueo de login y la
auditoría).

- `TRUSTED_PROXIES`: las IPs o rangos del proxy del proveedor, separados por espacio. Por defecto
  `private_ranges` (las redes privadas), que alcanza cuando el proxy llega por la red interna. Si el
  proveedor publica sus rangos, conviene ponerlos.
- No hace falta abrir el 443 en el servidor; el 80 debería aceptar conexiones solo desde el proxy del
  proveedor.

Si el proveedor solo da un subdominio propio (tipo `servidor.proveedor.com`) que apunta al VPS, es el
modo `auto`.

## Backups

El servicio `backup` hace uno por día a la hora `BACKUP_HOUR` (hora de Argentina) y deja en
`BACKUP_DIR` (por defecto `app/backups/`):

- `db-AAAAMMDD-HHMM.dump`: la base completa (`pg_dump` en formato custom).
- `uploads-AAAAMMDD-HHMM.tar.gz`: imágenes de productos, firmas y fotos de remitos.

Borra los de más de `BACKUP_KEEP_DAYS` días. Para hacer uno en el momento (por ejemplo antes de
actualizar):

```bash
docker compose exec backup sh /backup.sh now
```

**Importante**: esa carpeta está en el mismo servidor. Si se pierde el servidor, se pierden los backups.
Hay que copiarla afuera regularmente (otro servidor, un bucket, Google Drive con `rclone`, etc.). Ejemplo
con un cron del servidor que la sincroniza todas las noches:

```bash
30 4 * * * rsync -a --delete /ruta/a/app/backups/ usuario@otro-servidor:/backups/onaks/
```

### Restaurar

Con la app parada, se recrea la base vacía, se carga el dump y se reponen los archivos:

```bash
docker compose stop app caddy

# 1. Base: se borra y se recrea vacía, y se carga el backup.
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < backups/db-AAAAMMDD-HHMM.dump

# 2. Archivos: se extraen sobre el volumen de uploads.
docker run --rm -v onaks_system_uploads:/uploads -v "$PWD/backups:/backups:ro" \
  postgres:18-alpine tar -xzf /backups/uploads-AAAAMMDD-HHMM.tar.gz -C /uploads

docker compose up -d
```

El dump incluye la tabla de migraciones: al levantar, `migrate` no reaplica nada. Si el backup es de una
versión anterior, `migrate` aplica las migraciones que falten.

## Actualizar a una versión nueva

1. Hacer un backup en el momento (ver arriba).
2. Cambiar `APP_VERSION` en el `.env`.
3. Bajar las imágenes y reiniciar:

   ```bash
   docker compose pull app migrate
   docker compose up -d
   ```

   `migrate` aplica las migraciones nuevas antes de que arranque la app.

## Comandos útiles

```bash
docker compose ps                    # estado de los servicios
docker compose logs -f app           # logs de la app
docker compose logs caddy            # problemas con el certificado
docker compose exec backup ls -lh /backups
```

## Seguridad

- La base y la app no publican puertos: solo se llega a la app pasando por Caddy. Así nadie puede mandar
  una IP falsa en `X-Forwarded-For` para saltear el bloqueo de login o ensuciar la auditoría.
- `SESSION_SECRET` y `POSTGRES_PASSWORD` largos y al azar; el `.env` y `certs/` no se comparten ni se
  versionan.
- El firewall del servidor con solo 22 (SSH), 80 y 443 abiertos.
