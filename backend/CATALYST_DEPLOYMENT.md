# Medical POS on Catalyst

The backend is linked to the `medipos` project (78544000000061006), India data center, organization 60091775419.

Production: https://medical-pos-backend-50047153591.catalystappsail.in/api

Development: https://medical-pos-backend-50047153591.development.catalystappsail.in/api

Run `npm run build:catalyst` to compile the source, install locked production dependencies, and prepare the Linux x86-64 SQLite binary for Node 24. The generated `.catalyst-build/` contains an ignored, mode-0600 AppSail configuration populated from `.env` (or `CATALYST_ENV_FILE`). Credentials are sent as AppSail environment variables; the CLI excludes this configuration from the code archive. Never commit the build directory.

Run `npm run deploy:catalyst` to upload to Catalyst Development. Promote the project in the Catalyst console to reach Production. Initial production deployment requires a configured Catalyst payment method. The application binds `X_ZOHO_CATALYST_LISTEN_PORT` and rejects requests until migrations finish.

**Production environment variables are separate.** The first promotion did not copy their values. Configure the required variables from the generated AppSail configuration in the Production environment as well, then verify the health endpoint. Never print or commit their values.

## Browser origins / CORS

Catalyst intercepts `OPTIONS` requests before AppSail and owns CORS headers on this host. Register each frontend hostname in Cloud Scale Authentication's Authorized Domains with `cors: true`, `iframe: false`, then promote the Authentication/CORS changes from Development to Production. The API requires bare hostnames and rejects wildcard entries such as `*.nexsyrus.com`. Adding the apex hostname does not authorize its subdomains. The confirmed frontend origins are `nexsyrus.com` and `nexmed.nexsyrus.com`.

Express skips its own CORS middleware when `X_ZOHO_CATALYST_LISTEN_PORT` is present, preventing duplicate `Access-Control-Allow-Origin` headers. Other hosts continue to use `ALLOWED_ORIGINS`. Verify both preflight and actual responses with an `Origin` header; an HTTP 200 alone does not prove CORS works.

## Durable state

Cloud business transactions and private prescription originals use PostgreSQL. Startup applies migrations, then checks every archived SQLite checkpoint against its reviewed cutover receipt. An unmatched or changed checkpoint blocks readiness. Review staged differences before cutover and keep the original checkpoint for reconciliation. Local desktop command queues stay with their originating devices.

Backups and point-in-time recovery must include the database containing `app_runtime_checkpoints`, `app_prescription_documents`, and the operational tables. See [backup and recovery](../docs/phase-5/backup-and-recovery.md) for the restore drill and [release gates](../docs/phase-5/release-gates.md) for rollback.

## Verification

Run the full backend suite with a migrated disposable PostgreSQL database. Run `npm run test:durability` against the same disposable database to verify independent transactions and document rollback and persistence. Run `node scripts/test-checkpoint-cutover.cjs` to verify that the cutover preserves the original image and rejects stale review receipts.

After deployment, check `/api/health` for `status: ok` and `db.status: connected`, and confirm protected endpoints reject unauthenticated requests. A dedicated authenticated test account is needed to validate actual business workflows without touching customer records.
