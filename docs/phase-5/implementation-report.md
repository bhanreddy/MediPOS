# Medical POS Phase 5

## A. Phase summary

The release gate now runs the full backend suite against PostgreSQL in CI. A repeatable local workload exercised two stores, full and paged catalogues, dashboard and chain reports, and offline replay. The slow queries were rewritten after profiling. An encrypted database archive was restored to a new database and verified at the row, API and offline receipt levels. Batch disposal, warehouse permissions and recall isolation were hardened without removing the legacy workflows.

## B. Files changed

- CI and configuration documentation in `.github/workflows/backend.yml` and `backend/CATALYST_DEPLOYMENT.md`.
- Recovery tooling in `backend/scripts/backup-postgres.sh`, `restore-postgres-qa.sh`, and `pg-recovery-fingerprint.sql`.
- Load fixtures and runner in `backend/scripts/serve-phase1-qa.cjs` and `test-phase5-load.cjs`.
- Backend changes in `backend/src/routes/branches.ts`, `inventory.ts`, `reports.ts`, `backend/src/services/batchDisposal.ts`, `backend/src/services/inventory/productRecallEngine.ts`, and `backend/src/services/transfers/stockTransferService.ts`.
- Browser and mobile catalogue consumers in `web/src/services/inventoryCatalogue.ts`, `inventoryRadarCore.ts`, `web/src/hooks/useExpiryAlerts.ts`, `web/src/components/Inventory/InventoryCommandCenter.tsx`, `ExpiryRecallPage.tsx`, `web/src/components/Transfers/TransfersCommandCenter.tsx`, and `mobile/src/api/inventory.ts`.
- Coverage in `backend/src/__tests__/inventorySearchFetching.test.ts`, `backend/src/__tests__/integration/phase2Counter.pg.test.ts`, `phase3Pharmacy.pg.test.ts`, `phase4Branches.pg.test.ts`, `backend/src/__tests__/prescriptionRoutes.test.ts`, `web/tests/inventory-attention.test.cjs`, and `web/src-tauri/src/offline_outbox.rs`.
- Phase 5 implementation plan, this report, [backup and recovery](backup-and-recovery.md), [release gates](release-gates.md), the service and timer under `docs/phase-5/systemd/`, and the Phase 4 report cross-reference.

## C. Database changes

No new schema migration. The full canonical migration sequence was applied to each new QA database. Backup and restore preserved the schema, migration receipts and privileges on the local fixture. The independent fingerprint compared 25 selected relations.

## D. APIs changed

- `GET /api/inventory/medicines` accepts `page_size` from 1 to 500 and an optional `after` UUID. Paged calls receive `next_cursor`. The legacy response shape remains available. Main inventory views, transfer setup and mobile catalogue reads use pages of 250.
- `GET /api/inventory/medicines/search` aggregates the bounded FEFO page in one query. `GET /api/reports/dashboard` groups stock once before counting low-stock medicines.
- `POST /api/inventory/batches/:batchId/dispose` locks the batch, checks branch scope and active stock operations, and commits the branch position and disposal ledger with the batch update. Shared, reserved, in-transit and stocktake-locked batches require resolution before disposal. Advanced inventory routes require a warehouse grant for explicit warehouse access. Recall task completion checks the organization and location. Pharmacist sales and patient traces are restricted to the active store. Cashiers cannot open patient traces.
- Sister-store request replay returns the original request before checking current source stock. The first request still checks availability.

## E. Features completed

### Cashier burst

The final local run used 5,001 products, 10,002 batches, one API process, PostgreSQL 17 with a four-connection application pool, and two branch-restricted cashiers. Fifty unique requests per branch were launched together and interleaved. Each store had 40 units in its own batch of the same product. Each successful checkout used cash and UPI with an open drawer.

- 100 checkout requests finished in 587.9 ms. Aggregate p50 was 377.0 ms and p95 was 578.8 ms. The API handled 170.1 attempts/s and committed 136.1 sales/s in this burst.
- Each store committed 40 sales and returned 10 expected stock conflicts. East and west p95 were 578.8 ms and 579.4 ms. There were no unresolved requests, negative balances, or deadlock failures.
- PostgreSQL contained exactly the 80 accepted identities, 80 distinct invoice numbers, 160 tender rows and 80 sale ledger movements. Both ledgers showed every balance from 39 through zero. Ten duplicate checkout calls returned the original invoices. Four unauthorized cross-branch lookups returned 403.
- Ten parallel deliveries of one offline sale produced one sale, one tender, one stock movement and one receipt. Offline replay p95 was 21.0 ms in the final workload.

### Read performance

Endpoint readings use 20 samples with five concurrent requests, after a warm-up. All durations are local HTTP measurements including response parsing.

- POS search p95 fell from 1,093.8 ms to 46.6 ms.
- Full catalogue p95 fell from 5,158.1 ms to 561.9 ms. An equivalent stock query plan dropped from 2,558.4 ms and 12,502,500 rejected join candidates to 67.0 ms.
- A 250-medicine page reached 53.1 ms p95. One complete traversal returned the same 5,001 IDs, batch IDs and stock quantities as the unpaged route in 590.7 ms on a separate run.
- The previous dashboard warm-up exceeded the 30-second client deadline on the fixture. The revised dashboard p95 was 116.8 ms. The chain report was 39.0 ms p95.
- The final paged read suite used 290 ms of API CPU and measured 186 MiB RSS at the end. Checkout used 303 ms of CPU and ended at 271 MiB RSS. Event-loop delay p95 was 11.6 ms during reads and 10.5 ms during checkout. An earlier full-catalogue stress run reached about 619 MiB RSS after checkout. That legacy route remains available for compatibility. These readings cover one macOS ARM64 process and a localhost database.

### Recovery

The 1.53 MB encrypted archive took 0.643 seconds to create and 1.098 seconds to restore. All 25 relation fingerprints matched, including 81 sales, 161 tenders, 81 stock movements and the offline receipt. The fixture verified expiry of a matching old archive, preservation of an unrelated archive, refusal to restore into a populated database, and ciphertext tamper rejection before any tables were created. After startup against the restored data, ten retries of the original offline command returned the same invoice and produced no new rows. A native SQLite test recovered a pending outbox command from a WAL-safe snapshot and acknowledged it once.

### Legacy code audit

`BillingScreen.tsx` has no route or import found outside its definition. It retains a distinct keyboard, scanner, counter and terminal workflow. `WebPos` covers the active billing path. Hardware and shortcut parity for every legacy action is unverified, so the file remains.

`SuppliersHubScreen.tsx` combines supplier editing, ledger, purchasing and returns. The active app uses `SuppliersListPage` and procurement routes. The legacy customer, expense and report screens also have no external imports found. The canonical equivalents are `CustomersListPage`, `CustomerHistoryPage`, `ExpensesListPage` and `ReportsHubPage`. The audit did not establish complete behavioral parity across all screens and service callers, so none were removed. Legacy routes with active or uncertain client consumers remain.

## F. Testing results

- `npm --prefix backend run build` passed. `node backend/scripts/setup-qa.cjs` applied all migrations locally.
- `npm --prefix backend test -- --runInBand` with `TEST_DATABASE_URL` passed 924 tests across 60 suites. Four gated Supabase placeholders skipped. They check configuration or client construction and would not verify hosted transactions when enabled. PostgreSQL integration cases cover their local billing, stock, plan, and isolation behavior. The early optimization run failed two tests that asserted the previous SQL and query sequencing. The updated tests retain the response, stock and bounded-query checks. Intermittent HTTP fixture failures were addressed by binding one loopback listener for each affected suite and closing it after the suite.
- Coverage includes authentication, role and tenant permissions, medicine creation and imports, batches, purchase inwarding, supplier reconciliation, FEFO, billing and contention, split tender, returns and refunds, drawers, stocktakes, prescription controls, statutory exports, transfers, and offline synchronization. Similar sale, permission and stock assertions appear in unit and PostgreSQL suites to exercise different boundaries. The gaps identified were the hosted integration placeholders, larger real-HTTP contention, and real archive recovery. The latter two now have dedicated runners.
- `npm --prefix web test` passed 127 tests and the production build passed. Chrome reran the branch selector, stock discovery and grant checks on the final code.
- `node --test mobile/tests/*.test.cjs` passed 41 tests and the mobile TypeScript check passed. `npm --prefix backend run test:desktop-outbox` passed seven native outbox tests.
- `node backend/scripts/test-durable-runtime.cjs` and `test-checkpoint-cutover.cjs` passed. The phase load runner, archive restore, changed-ciphertext and nonempty-target checks, and post-restore API replay passed.
- The Catalyst Linux x86-64 Node 24 bundle built with synthetic settings. The production Node entry point returned healthy and connected on the restored database, and returned 401 for an unauthenticated sales request. Workflow YAML and shell syntax checks passed, as did `git diff --check`.

## G. Remaining limits

The CI definition was verified locally. A GitHub-hosted run is pending the next normal push or PR. No backup timer or off-host destination was installed. The backup role, managed Auth configuration and provider recovery require hosting-specific setup. The fixture had no populated regulated dispensing or archived checkpoint rows. Document durability and checkpoint retention were separately tested against PostgreSQL.

Sustained traffic behind a shared IP can reach the existing 300 requests/minute limiter. Hosted ingress, production-size data, multiple API replicas, actual operator devices, printer hardware, live payment providers and GST portal import remain unverified. The workload used synthetic records, one cashier per branch, and one API process.

## H. Acceptance criteria

- Critical automated regressions — PASSED locally.
- PostgreSQL integration suite in CI — IMPLEMENTED, hosted execution NOT VERIFIED.
- Fifty concurrent cashier operations per store and inventory, payment and ledger integrity — PASSED in local QA.
- Encrypted restore, recovery validation, and offline synchronization — PASSED in local QA.
- No critical security finding or P0/P1 defect in the exercised workflows — PASSED for the scoped local checks. Production-wide assurance NOT VERIFIED.
- Deployment configuration and rollback procedure — local package, restored startup and documented rollback PASSED. Hosted rollback and external dependencies NOT VERIFIED.

## I. Risk assessment

The read and checkout numbers describe a synthetic burst on one machine. Production sign-off still depends on hosted CORS and capacity testing, validated backup storage and roles, staging rollback, and provider reconciliation. The full-catalogue compatibility route can exceed the current Catalyst memory budget under concurrent reads. The paged first-party paths reduce that pressure. Older clients and any unpaged consumers require capacity verification.

## J. Readiness

All five implementation phases have local verification reports. The final artifacts are ready for review and staging rehearsal. The hosted checks in the [release gates](release-gates.md) remain open.
