#!/usr/bin/env bash
# Uji restore: memulihkan backup ke database SEMENTARA lalu membandingkan jumlah baris tiap tabel,
# jumlah migrasi, dan trigger append-only dengan database sumber. Tidak menyentuh database sumber.
#
#   DB_CONTAINER=eventra-db-1 ops/restore-verify.sh backups/eventra-XXXX.dump
#
# Hanya mode Docker (database uji dibuat di container yang sama, lalu dihapus).
set -euo pipefail

DUMP="${1:?Gunakan: ops/restore-verify.sh <berkas.dump>}"
: "${DB_CONTAINER:?Set DB_CONTAINER}"
DB_NAME="${DB_NAME:-eventra}"
DB_USER="${DB_USER:-eventra}"
CHECK_DB="eventra_restore_check"

if [[ -f "$DUMP.sha256" ]]; then
  ( cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256" )
fi

psql_in() { docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -v ON_ERROR_STOP=1 -At "$@"; }

cleanup() { psql_in -d postgres -c "DROP DATABASE IF EXISTS $CHECK_DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
psql_in -d postgres -c "CREATE DATABASE $CHECK_DB" >/dev/null
docker cp "$DUMP" "$DB_CONTAINER:/tmp/restore.dump"
docker exec "$DB_CONTAINER" pg_restore -U "$DB_USER" -d "$CHECK_DB" --no-owner --exit-on-error /tmp/restore.dump
docker exec "$DB_CONTAINER" rm -f /tmp/restore.dump

# Hitung baris tiap tabel (urut nama) di database tertentu.
counts() {
  local db="$1" tables
  tables="$(psql_in -d "$db" -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")"
  for t in $tables; do
    printf '%s=%s\n' "$t" "$(psql_in -d "$db" -c "SELECT count(*) FROM \"$t\"")"
  done
}
triggers() {
  psql_in -d "$1" -c "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal"
}

SRC="$(counts "$DB_NAME")"
RST="$(counts "$CHECK_DB")"
echo "Tabel diperiksa: $(echo "$RST" | wc -l)"

STATUS=0
if [[ "$SRC" != "$RST" ]]; then
  echo "BEDA jumlah baris (sumber ≠ hasil restore) — bila backup lebih lama dari data terkini, ini wajar:"
  diff <(echo "$SRC") <(echo "$RST") || true
  STATUS=1
fi
if [[ "$(triggers "$DB_NAME")" != "$(triggers "$CHECK_DB")" ]]; then
  echo "BEDA jumlah trigger (proteksi append-only tidak ikut terpulihkan)"; STATUS=1
fi
if [[ "$(psql_in -d "$CHECK_DB" -c "SELECT count(*) FROM _prisma_migrations")" != "$(psql_in -d "$DB_NAME" -c "SELECT count(*) FROM _prisma_migrations")" ]]; then
  echo "BEDA jumlah migrasi"; STATUS=1
fi
[[ $STATUS -eq 0 ]] && echo "RESTORE OK: semua tabel, trigger, dan migrasi identik dengan sumber."
exit $STATUS
