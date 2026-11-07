# Medical POS Phase 1 — implementation and verification

## A. Phase summary

PostgreSQL is the authoritative business store in cloud mode. Cloud requests no longer load, compress, or persist a shared SQLite database, and unrelated requests can transact independently. The existing routers, authentication flows, tenant controls, calculation utilities, and frontend structure were retained. The local SQLite engine remains available outside cloud mode; the desktop app also has a persistent SQLite outbox that submits business commands for server validation.

Phase 1 was implemented and tested in the existing checkout on disposable local PostgreSQL. No deployment, push, or production database access took place.

## B. Files changed

See [the complete file inventory](files-changed.md). It distinguishes Phase 1 changes from pre-existing changes in the checkout. No pre-existing user files were removed.

## C. Database changes

| Migration | Effect |
| --- | --- |
| 031 | Adds missing PostgreSQL metadata, fields, and compatibility records used by operational services formerly backed by SQLite. Adds a nonnegative batch-stock check for new writes without assuming old rows are clean. |
| 032 | Adds a database trigger that blocks restricted sale items using stored medicine flags and verifies clinic ownership. |
| 033 | Reconciles supplier balances with invoices; records opening differences without deleting old balances. Adds payment identities, invoice allocations, payable references and access restrictions. |
| 034 | Adds per-item restock decisions and append-only credit notes with refund breakdown and actor information. |
| 035 | Adds a private offline command inbox with immutable request identity and final outcome. Backfills missing organization links where the clinic already has a PostgreSQL organization. |
| 036 | Adds private staging rows and reviewed cutover receipts. The legacy SQLite checkpoint and its revision remain intact. |
| 037 | Adds independent counter identity and uniqueness for stocktake count requests. |
| 038 | Adds supplier return credits and allocations, including credits carried forward to future invoices. |
| 039 | Extends the inventory ledger movement constraint for reconciliation and transfer variances, adds a return payment reference, and fills metadata missing from earlier commercial schemas. |

Migrations 029 and 030 were already present in the starting checkout. The complete sequence was applied to fresh local PostgreSQL databases; the QA cutover test verified that a synthetic checkpoint and its canonical customer both survived unchanged.

### Cutover and rollback

The cutover tool defaults to a read-only inventory: `node backend/scripts/stage-runtime-checkpoint.cjs --name <checkpoint>` with an explicitly set `MIGRATION_DATABASE_URL`. It does not load environment files. The optional `--report <path>` contains only counts and the image hash.

For a future approved rollout, first take a verified backup and stop legacy writers so the final checkpoint cannot change during reconciliation. Use `--stage`, review the staged records against PostgreSQL by tenant, and reconcile missing transactions and financial differences explicitly. Record each decision using `--resolve-table`, `--resolve-key`, `--disposition`, `--target-id` where required, `--reason`, and `--reviewer`. Use `--finalize --reviewer <name>` only after reconciling every row, including pending sync operations. Cloud startup checks that the receipt matches the final revision and image hash. Retain the checkpoint, archive and receipts for recovery. The tool does not import or overwrite business records automatically.

Before the new app accepts writes, an application rollback can use the original backup and checkpoint as part of an agreed recovery plan. After PostgreSQL accepts new writes, do not restart the old SQLite writer over the same workload; reconcile the new transactions before changing authorities. Keep payment, credit-note, offline and ledger evidence. Removing the restricted-dispensing trigger as part of a rollback would reopen the defect.

## D. APIs changed

- **New:** `POST /api/sales/quote`, `GET /api/sales/:id/return-options`, `POST /api/sales/returns/quote`, `GET /api/offline/commands`, and `POST /api/offline/commands`.
- **Sales:** `GET /api/sales` searches invoice/customer data in PostgreSQL. `POST /api/sales` validates automatic or manual allocation, stored product restrictions, and the quoted total. `POST /api/sales/returns` applies the original invoice cap and records the credit note; it requires an idempotency key. `GET /api/sales/:id/invoice` renders a printable credit note for returns. The legacy `POST /api/pos/checkout` has the same fail-closed dispensing rule; the legacy `/api/pos/returns` and `/api/pos/returns/quote` use the same return rules in cloud mode. Cash, UPI, card and original tender are supported for recording refunds; the legacy `STORE_CREDIT` refund selector is rejected in cloud mode.
- **Suppliers and purchases:** `POST /api/suppliers/:id/payment`, `PATCH /api/purchases/:id/payment`, and `POST /api/procurement/payments` reconcile invoice allocations and payable ledger in the same transaction. `GET /api/suppliers/:id/outstanding` and `GET /api/purchases/:id` expose authoritative balances and history. `POST /api/purchases/purchase-returns` records and allocates supplier credits.
- **Inventory and patient care:** Existing `/api/inventory/stocktakes`, inventory reconciliation, `/api/transfers`, `/api/customers`, `/api/patients` and `/api/prescriptions` use PostgreSQL in cloud mode. Customer creation rejects exact normalized name-and-phone duplicates; the API does not auto-merge existing identities. Pharmacy staff roles and tenant checks gate access to clinical records. Existing operational route paths were retained during the database migration.
- **Sync:** `POST /api/bills/sync` and `POST /api/bills/migrate` send legacy bill submissions through the validated command inbox. Raw row sync is disabled in cloud mode. Rejected or conflicting commands remain available for review.

## E. Verified features

- Real PostgreSQL stocktake reduced a batch from 10 to 4. The next checkout refused 5 units and sold 4. Posting a stale count failed instead of undoing a sale. Reconciliation updated the batch, store position and ledger; a store transfer produced exact outbound and inbound entries and replayed the receipt without adding stock twice.
- FEFO sold 10 units across batches as 3 + 7 and wrote exactly those ledger deductions. It excluded expired and disposed stock, used both batches' prices, and rejected a stale total. With 20 tills competing for 13 units, exactly 13 invoices were written and 7 requests returned an insufficient-stock conflict.
- A cashier found an invoice in Chrome, returned one unit against its original batch, retried after the first HTTP response was lost and produced one ₹10 refund record and a printable credit note. PostgreSQL also verified full and partial returns, return caps, role checks for restocking, credit-note immutability, legacy returns and both batch allocations from a legacy checkout.
- A ₹10,000 invoice with a ₹4,000 payment showed ₹6,000 due. Simultaneous retries posted one payment. A second ₹6,000 payment closed the invoice and appeared in history. A paid-invoice return carried a ₹10,000 credit to a later ₹12,000 purchase, leaving ₹2,000 due. An injected allocation failure rolled back the whole payment.
- Customer lookup, patient allergies and prescription history shared the same customer ID. Tests rejected accidental duplicate creation, cashier access to clinical data, and cross-tenant access.
- Restricted classifications and the independent prescription flag blocked checkout using stored data, including when a request supplied contradictory flags or claimed pharmacist approval. A direct SQL sale-item insert was also rejected. The offline inbox retained rejected commands and returned the original receipt on retry.

## F. Testing results

Commands ran from the repository root. `$TEST_DATABASE_URL` was a fresh, localhost-only PostgreSQL 17 database ending in `_qa`. A synthetic `WALLET_LEDGER_SECRET` was supplied for wallet fixtures.

| Command / check | Actual result |
| --- | --- |
| `npm --prefix backend run build` and `node backend/scripts/setup-qa.cjs` | Passed; backend compiled and all migrations applied to fresh QA databases. |
| `npm --prefix backend test -- --runInBand` | **888 passed; 4 skipped; 0 failed.** The skipped tests were the opt-in Supabase integrations (plan, sales, stock ledger and multitenancy); no external Supabase test project was configured. |
| `npm --prefix backend run test:phase1` | **23 passed** with real PostgreSQL. Included in the backend regression total. |
| `npm --prefix backend run test:durability` | Passed; independent transactions, forced commit failure, database and private document rollback, and unchanged checkpoints. |
| `node backend/scripts/test-checkpoint-cutover.cjs` | Passed; read-only default, staging and explicit review, intact source image, and stale receipt rejection. |
| `npm --prefix web test` and `npm --prefix web run build` | **127 passed**; Vite production build passed. |
| `node --test mobile/tests/*.test.cjs` | **41 passed**. No physical mobile device workflow was run. |
| `npm --prefix backend run test:desktop-outbox` | **6 passed** against SQLite, including restart durability, identity conflicts and acknowledgement. |
| `TAURI_CONFIG='{"bundle":{"externalBin":[]}}' cargo check --locked --offline --manifest-path web/src-tauri/Cargo.toml` | Passed compilation with the sidecar requirement disabled for this check. The standard build stopped because the existing macOS Node sidecar binary is missing. Native packaging and packaged offline replay were not verified. |
| `node backend/scripts/serve-phase1-qa.cjs` + `node backend/scripts/test-phase1-browser.cjs` | Chrome + Playwright passed the end-to-end sale, lost-response retry and credit note workflow against the built API and local PostgreSQL. |
| `node backend/scripts/smoke-read-routes.cjs` | **113 reads:** 88 successful, 21 expected 4xx for missing parameters/permissions, 1 unconfigured super-admin dependency, 3 errors on external Supabase plans/invoices/medicine-master endpoints absent from the local stub. The smoke command returned nonzero. |
| `git diff --check` | Passed. |

To repeat the browser check, set `QA_AUTH_FILE` to a disposable file outside the repository, start the QA API on port 55601, and start Vite on port 4179 with `VITE_API_URL=http://127.0.0.1:55601/api`, `VITE_SUPABASE_URL=http://127.0.0.1:55601`, and a synthetic `VITE_SUPABASE_ANON_KEY`. Install Playwright separately with Chrome available, set `QA_PLAYWRIGHT_MODULE` to its module path if needed, and run the browser script. Restart the fixture server to seed stock for another run.

## G. Remaining defects and limits

- Actual legacy checkpoint contents and production opening balances were not inspected. Any embedded-only transactions must be reconciled before rollout; startup blocks unreconciled checkpoints. Staging is intentionally separate from importing records.
- The desktop outbox stores a pending bill and can replay it when connected. The app does not complete an offline dispensing transaction, provide a full offline catalogue, or issue a final invoice without acknowledgement. The native package requires the missing Node sidecar. Operator resolution of conflicts is manual; conflicts can be inspected and exported.
- The three external Supabase reads, super-admin integration and four opt-in Supabase tests remain unverified against their services. Checkout/returns were verified in browser with synthetic sign-in credentials and a local subscription stub.
- Card and UPI refund methods record the tender and reference. This change does not call a payment processor or move external funds.
- Restricted dispensing remains disabled until a lawful and verified workflow exists. Stored product classification is the boundary; inaccurate catalogue data must be corrected before rollout. No full compliance claim or positive restricted sale is made.

The safety decision was informed by the [CDSCO Drugs Rules index](https://www.cdsco.gov.in/opencms/opencms/en/Acts-and-rules/Drugs-Rules/), [CDSCO consolidated Drugs Rules, Rule 65](https://cdsco.mohfw.gov.in/opencms/resources/UploadCDSCOWeb/2022/drug_rules/Drugs%20Rules%201945_2024%2009.pdf), and the Ministry of Health's notices on [prescriptions and pharmacist supervision](https://www.pib.gov.in/newsite/erelcontent.aspx?lang=2&reg=48&relid=132510) and [Schedule H1 recordkeeping](https://www.pib.gov.in/newsite/PrintRelease.aspx?lang=2&reg=48&relid=101251). The implementation does not assume one authorization or recordkeeping workflow covers every schedule or NDPS category.

## H. Phase 1 exit criteria

1. **PASSED (QA)** — Cloud business requests used PostgreSQL without opening SQLite; unrelated PostgreSQL transactions overlapped. Production cutover is gated separately.
2. **PASSED (QA)** — A production-mode PostgreSQL stocktake changed batch and ledger stock; the next checkout used that correction.
3. **PASSED** — FEFO split 3 + 7 with exact ledger entries and prevented overselling under concurrent checkouts.
4. **PASSED** — The cashier completed the return in Chrome, retried safely, and opened the printable credit note.
5. **PASSED** — Supplier balances, multiple payments, invoice history, duplicate protection and rollback agreed in PostgreSQL.
6. **PASSED** — Customer and patient identity, allergies and prescriptions agreed across modules under role and tenant checks.
7. **PASSED (fail-closed)** — Verified stored classifications could not be bypassed through checkout, offline replay or direct PostgreSQL sale-item insertion. Restricted dispensing stays disabled.
8. **PASSED (local regression scope)** — All configured backend, web, mobile and outbox suites passed. The external integration and native package checks listed above remain **NOT VERIFIED**.

## I. Risk assessment

The greatest rollout risk is unreconciled legacy business data, including opening payables and stock split across locations. Compare inventory positions, batch totals, ledger movements, unpaid invoices, and unapplied credits by clinic before and after an approved cutover. Exercise each external integration in staging, build and replay a native package with its real sidecar, and monitor checkout rejection and duplicate-conflict rates during a staged rollout. Some older operational SQL uses a compatibility adapter; less common warehouse, commercial and reporting write paths were not exhaustively exercised against production-shaped data.

## J. Next phase readiness

Phase 1 is ready for code review, with its core acceptance scenarios verified locally. A release is blocked pending checkpoint reconciliation where applicable, staging integration checks and native package verification. Phase 2 was not started; the user's review is the next gate.
