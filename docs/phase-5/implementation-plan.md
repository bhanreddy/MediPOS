# Phase 5 implementation plan

The existing PostgreSQL CI service runs three integration suites, while the local regression run reaches 924 backend tests across 60 suites. The full PostgreSQL run needs CI coverage. The application has an owner JSON export and a runtime checkpoint tool. A consistent, encrypted database archive and a restore exercise are missing. Existing contention tests send two requests, so they do not measure the required cashier burst. The listed legacy screens have no external imports in the first source search, which does not establish functional parity.

1. Inspect regression coverage and named legacy components, map reusable behavior and keep anything whose live equivalent is unverified. Expand `.github/workflows/backend.yml` to run all PostgreSQL cases and use the existing runtime durability test.
2. Add a localhost-only performance runner for the real API and a separate QA seed. Generate 50 simultaneous unique cashier operations at each of two stores with overlapping product identity, deliberate replay, and a stock shortage. Verify invoice, payment, ledger and branch isolation. Measure API and database timings, large catalogue, offline replay, CPU, memory and event loop. Change SQL or indexes only after measuring and rerun the same workload.
3. Add a scheduled encrypted PostgreSQL backup runner, retention, an isolated restore procedure, and a recovery fingerprint. Use PostgreSQL 17 client tools and an OpenSSL release with CMS AES-GCM. Validate both database replay receipts and the desktop outbox.
4. Close reproducible branch security gaps, document deployment and rollback gates, and run backend, web, mobile, desktop, and restore checks. Railway, Catalyst, Supabase, third-party integrations and production infrastructure stay outside the local test run.

The expected changes are CI, backup and QA scripts, deployment and recovery documentation, and targeted backend fixes. Add a migration only if a measured SQL plan justifies an index or view change. No new public API is planned.

## Repeat the workload

Build the backend, create a fresh local database whose name ends in `_qa`, and export its URL as `TEST_DATABASE_URL`. Apply `node backend/scripts/setup-qa.cjs`. In a shell with `umask 077`, choose unused paths outside the repository for `QA_AUTH_FILE` and `QA_REPLAY_FILE`. Set `QA_API_URL=http://127.0.0.1:55605` and `QA_LOAD_TEST=1`, then start `node backend/scripts/serve-phase1-qa.cjs`. A new fixture is required for each checkout run because the workload consumes all available stock.

With the same URL and fixture paths in a second shell, run `QA_READS=search,catalogue_page,dashboard,chain node backend/scripts/test-phase5-load.cjs`. To compare every page against the legacy full response without selling stock, use the `reads` argument and set `QA_VERIFY_CATALOGUE=1`. To validate a restored database, restart the QA server with `QA_REUSE_FIXTURE=1`, the saved fixture and its original explicitly supplied `QA_JWT_SECRET`. Use the `restore` argument and original replay file.
