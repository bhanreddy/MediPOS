#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${PGHOST:?Set PGHOST for the source database}"
: "${PGDATABASE:?Set PGDATABASE for the source database}"
: "${BACKUP_DIR:?Set BACKUP_DIR to a private directory}"
: "${BACKUP_CERT:?Set BACKUP_CERT to the trusted recipient certificate path}"
days=${BACKUP_RETENTION_DAYS:-30}
[[ "$PGDATABASE" =~ ^[a-zA-Z0-9_]+$ && "$days" =~ ^[1-9][0-9]{0,3}$ ]] || {
  echo 'Invalid database name or retention period.' >&2
  exit 2
}
[[ -d "$BACKUP_DIR" && -O "$BACKUP_DIR" && ! -L "$BACKUP_DIR" ]] &&
  [[ -n "$(find "$BACKUP_DIR" -prune -perm 0700 -print)" ]] || {
  echo 'The backup directory must be owned by this account and have mode 0700.' >&2
  exit 2
}
[[ -z "${PGSERVICE:-}" && -z "${PGHOSTADDR:-}" ]] || {
  echo 'Use a direct libpq host and database configuration.' >&2
  exit 2
}
if [[ "$PGHOST" != 127.0.0.1 && "$PGHOST" != localhost && "${PGSSLMODE:-}" != verify-full ]]; then
  echo 'Remote PostgreSQL backups require PGSSLMODE=verify-full.' >&2
  exit 2
fi
partial=$(mktemp "$BACKUP_DIR/.medical-${PGDATABASE}.XXXXXX")
trap 'rm -f -- "$partial"' EXIT
stamp=$(date -u +%Y%m%dT%H%M%SZ)
suffix=${partial##*.}
archive="$BACKUP_DIR/medical-${PGDATABASE}-${stamp}-${suffix}.pgdump.cms"
pg_dump --no-password --format=custom --lock-wait-timeout=30s |
  openssl cms -encrypt -binary -aes-256-gcm -stream -outform DER -out "$partial" "$BACKUP_CERT"
test -s "$partial"
mv -- "$partial" "$archive"
for previous in "$BACKUP_DIR"/medical-"${PGDATABASE}"-????????T??????Z-??????.pgdump.cms; do
  [[ -f "$previous" && ! -L "$previous" && "$previous" != "$archive" ]] || continue
  find "$previous" -prune -type f -mtime "+$days" -exec rm -- {} \;
done
printf '%s\n' "$archive"
