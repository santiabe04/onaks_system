#!/bin/sh
# Backup diario de la base y de los archivos subidos (imágenes de productos,
# firmas y fotos de remitos). Corre en la imagen de Postgres (mismo pg_dump que
# la base) y deja en /backups:
#   db-AAAAMMDD-HHMM.dump       pg_dump en formato custom (se restaura con pg_restore)
#   uploads-AAAAMMDD-HHMM.tar.gz
# Borra los de más de BACKUP_KEEP_DAYS días. Ver docs/instalacion.md.
set -eu

BACKUP_DIR=/backups
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
# Hora del día (0-23, hora de Argentina) en la que corre.
RUN_HOUR="${BACKUP_HOUR:-3}"

log() {
  echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') $*"
}

run_backup() {
  stamp=$(date '+%Y%m%d-%H%M')
  db_file="$BACKUP_DIR/db-$stamp.dump"
  uploads_file="$BACKUP_DIR/uploads-$stamp.tar.gz"

  # A un archivo temporal y después se renombra: un backup a medias nunca
  # queda con el nombre final.
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h db -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" --format=custom --file="$db_file.partial"
  mv "$db_file.partial" "$db_file"

  tar -czf "$uploads_file.partial" -C /uploads .
  mv "$uploads_file.partial" "$uploads_file"

  find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) \
    -mtime +"$KEEP_DAYS" -delete
  log "listo: $(basename "$db_file"), $(basename "$uploads_file")"
}

mkdir -p "$BACKUP_DIR"

# `backup.sh now` hace uno en el momento (por ejemplo antes de actualizar).
if [ "${1:-}" = "now" ]; then
  run_backup
  exit 0
fi

log "programado todos los días a las ${RUN_HOUR}:00, se guardan ${KEEP_DAYS} días"
last_day=""
while true; do
  hour=$(date '+%H' | sed 's/^0//')
  today=$(date '+%Y%m%d')
  if [ "${hour:-0}" -eq "$RUN_HOUR" ] && [ "$today" != "$last_day" ]; then
    if run_backup; then
      last_day="$today"
    else
      log "falló; se reintenta en 10 minutos"
    fi
  fi
  sleep 600
done
