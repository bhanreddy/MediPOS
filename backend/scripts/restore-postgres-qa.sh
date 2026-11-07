#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${PGHOST:?Set PGHOST to the isolated local PostgreSQL listener}"
: "${PGDATABASE:?Set PGDATABASE to a fresh disposable database ending in _qa}"
: "${BACKUP_CERT:?Set BACKUP_CERT to the recipient certificate path}"
: "${BACKUP_KEY:?Set BACKUP_KEY to the corresponding private key path}"
archive=${1:?Pass the trusted .pgdump.cms archive path}
if [[ "$PGHOST" != 127.0.0.1 && "$PGHOST" != localhost ]] ||
   [[ ! "$PGDATABASE" =~ ^[a-zA-Z0-9_]+_qa$ || -n "${PGHOSTADDR:-}${PGSERVICE:-}" ]]; then
  echo 'Restore requires a disposable localhost *_qa database and direct libpq settings.' >&2
  exit 2
fi
objects=$(psql -XAt --no-password --set=ON_ERROR_STOP=1 -c "
  SELECT (SELECT count(*) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema','public'))
       + (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace)
       + (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace)
       + (SELECT count(*) FROM pg_extension WHERE extname <> 'plpgsql')")
if [[ "$objects" != 0 ]]; then
  echo 'The target database is not empty.' >&2
  exit 2
fi
scratch=$(mktemp -d "${TMPDIR:-/tmp}/medical-restore.XXXXXX")
trap 'rm -f -- "$scratch/archive.dump"; rmdir -- "$scratch"' EXIT
# GCM verification finishes before PostgreSQL sees any of the archive.
openssl cms -decrypt -binary -inform DER -in "$archive" -recip "$BACKUP_CERT" -inkey "$BACKUP_KEY" -out "$scratch/archive.dump"
pg_restore --list "$scratch/archive.dump" > /dev/null
pg_restore --no-password --single-transaction --dbname="$PGDATABASE" "$scratch/archive.dump"
printf 'Restored %s into %s\n' "$(basename "$archive")" "$PGDATABASE"
