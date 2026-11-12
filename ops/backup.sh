#!/usr/bin/env bash
# Backup PostgreSQL Eventra (format custom, terkompresi) + checksum.
#
#   Docker (dev/staging):  DB_CONTAINER=eventra-db-1 ops/backup.sh
#   Server langsung:       DATABASE_URL=postgresql://... ops/backup.sh
#
# Variabel: BACKUP_DIR (default ./backups), DB_NAME/DB_USER (hanya mode Docker), KEEP (jumlah berkas disimpan, default 14).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP="${KEEP:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/eventra-$STAMP.dump"
mkdir -p "$BACKUP_DIR"

if [[ -n "${DB_CONTAINER:-}" ]]; then
  DB_NAME="${DB_NAME:-eventra}"
  DB_USER="${DB_USER:-eventra}"
  docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner -f /tmp/eventra.dump
  docker cp "$DB_CONTAINER:/tmp/eventra.dump" "$OUT"
  docker exec "$DB_CONTAINER" rm -f /tmp/eventra.dump
elif [[ -n "${DATABASE_URL:-}" ]]; then
  # Buang parameter ?schema=public khas Prisma yang tidak dikenal libpq.
  pg_dump "${DATABASE_URL%%\?*}" -Fc --no-owner -f "$OUT"
else
  echo "Set DB_CONTAINER (Docker) atau DATABASE_URL." >&2
  exit 2
fi

# Checksum agar integritas berkas dapat diverifikasi sebelum restore.
( cd "$BACKUP_DIR" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256" )
echo "Backup selesai: $OUT ($(wc -c < "$OUT") byte)"

# Rotasi: simpan KEEP backup terbaru.
ls -1t "$BACKUP_DIR"/eventra-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old" "$old.sha256"
done
