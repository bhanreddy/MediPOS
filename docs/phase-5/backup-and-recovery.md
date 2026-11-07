# Backup and recovery

## Schedule and storage

The backup script writes a consistent PostgreSQL custom archive through OpenSSL CMS with AES-256-GCM. The scheduler needs only the recipient certificate. Keep its corresponding private key in the separate recovery environment and retain the matching keys for older backups. Use a dedicated backup account, a mode-0700 backup directory, mode-0600 credentials and archive files, and a protected off-host copy with access logging and deletion protection. Restrict write access to the archive location. Recipient encryption protects confidentiality and detects altered ciphertext. An attacker with the public certificate and archive write access can still substitute an archive, so the recovery operator must obtain it from a trusted backup location.

Configure the included [service](systemd/medical-pos-backup.service) and [timer](systemd/medical-pos-backup.timer) on a backup host. Install the executable and unit files at their specified paths, provision the `medical-backup` account, and set these values in `/etc/medical-pos/backup.env`.

```ini
PGHOST=replace-with-the-direct-database-host
PGPORT=5432
PGDATABASE=postgres
PGUSER=medical_backup
PGPASSFILE=/etc/medical-pos/backup.pgpass
PGSSLMODE=verify-full
PGSSLROOTCERT=/etc/medical-pos/database-ca.pem
BACKUP_DIR=/var/lib/medical-pos-backups
BACKUP_CERT=/etc/medical-pos/backup-recipient.pem
BACKUP_RETENTION_DAYS=30
```

Use a direct or session PostgreSQL connection, a PostgreSQL client at least as recent as the server, and OpenSSL 3 with CMS support. [PostgreSQL backup reference](https://www.postgresql.org/docs/17/app-pgdump.html) · [OpenSSL CMS reference](https://docs.openssl.org/3.5/man1/openssl-cms/) The role needs to read all intended schemas and rows, including RLS-protected documents and business tables. Keep `pg_dump` error and timer failure alerts enabled and verify archive freshness from the backup host. The timer runs daily at 01:00 UTC, with up to 15 minutes of jitter. Retention prunes only matching database archives after a successful new backup. Send the encrypted file to protected off-host storage before relying on the timer for production recovery.

The archive includes the database objects and data visible to the backup role. Maintain the required database roles, extensions, provider-managed Auth configuration, external object stores, application secrets, and endpoint settings independently. Provider point-in-time recovery can reduce data loss between daily archives. The owner JSON export in the app is intended for clinic records.

## Restore rehearsal

1. Select a trusted archive and create a fresh localhost database with a name ending in `_qa`. Provision its extensions and roles as required by the archive. Use an isolated PostgreSQL instance for sensitive archives, with outbound integrations disabled and temporary files on an encrypted volume.
2. Set `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `BACKUP_CERT`, `BACKUP_KEY`, and `TMPDIR` for that target. Run `backend/scripts/restore-postgres-qa.sh /path/to/archive.pgdump.cms`. The script rejects populated databases, verifies the ciphertext before starting the restore, and restores schema and data in one transaction.
3. For a quiescent QA source, compare the output of `psql -qXf backend/scripts/pg-recovery-fingerprint.sql` on the source and restored database. The script fingerprints core relations without printing individual records. On a live source, capture the reference under the same backup snapshot or reconcile later writes separately.
4. Start the matching application version against the isolated restore. Verify health, access checks, the invoice register, stock and tender totals, and a known offline command. The same command ID must return its saved receipt and leave invoice, ledger and tender counts unchanged.
5. Log the archive's timestamp, test result and end-to-end recovery duration. A production incident also requires explicit reconciliation of orders, payments and device commands that arrived after the chosen recovery point.

## Desktop outbox

Offline commands that have never synchronized exist on the device. Locate `offline_commands.db` in the Tauri app data directory. Create a consistent SQLite snapshot using the SQLite backup API or `sqlite3 /path/to/offline_commands.db ".backup '/private/path/offline_commands.snapshot.db'"`. A live copy of only the main file can omit committed WAL data. Store the snapshot as sensitive business data.

With the app closed, preserve the old database and sidecar files separately, restore the snapshot as `offline_commands.db`, and reopen with the same clinic and user. Retain the original device and command IDs. Review conflicts explicitly. If a server backup predates a receipt, reconcile already-settled external transactions before attempting any replay.
