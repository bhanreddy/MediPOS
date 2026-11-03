> Latest pass: [26 October 2026 route audit, regression results and remaining blockers](qa/production-polish-2026-10-26/REPORT.md). The historical results below are retained for reference.

# Release validation — 8 October 2026

The updated source builds successfully for both the web application and backend. Testing used the supplied OWNER account for authentication, with synthetic business records in a separate local PostgreSQL database and embedded database. Production business records were not edited. This is local validation, not confirmation that the hosted deployment has been updated.

## Verified

- 367 backend tests passed; four existing Supabase integration tests remain skipped because their dedicated test credentials are not configured.
- 32 web regression tests passed, covering session recovery, manual logout, concurrent refresh, billing search, payment payloads, API contracts, and prevention of automatic write retries.
- Mobile TypeScript checks, all 13 mobile session regression tests, and production JavaScript bundle exports for both iOS and Android passed.
- All 242 discovered frontend API call sites match mounted backend methods and paths. Static route precedence is also checked automatically.
- 74 distinct frontend read endpoints returned HTTP 200 with appropriate local fixtures and query parameters.
- Browser checks covered all 36 clinic route paths, the payment-return route, public navigation and missing-page handling. The seven admin route paths correctly reject the OWNER account. Admin handlers also have isolated authorization, validation, and error tests; a real SUPER_ADMIN browser session was not available.
- Narrow-screen checks covered 33 clinic routes at 390 × 844. Overflow fixes were retested for procurement, transfers, warehouse, and purchase entry.
- Browser saves verified customers and their credit limits, suppliers with optional fields, expenses, clinic settings, purchase invoices, a paid sale, invoice details, organization price books, coupons, stocktake drafts, procurement purchase-order drafts with existing catalog medicines and suppliers, and prescription entry, matching, verification, original document upload and authenticated preview. Transactions used local synthetic data only.
- The full SQL migration sequence and the actual startup migration runner were rehearsed against a separate copy of the older database structure, without production rows.

## Critical corrections

Billing now preserves the displayed inclusive price, discounts, actual received amount, and balance due. Writes commit atomically before success responses. Stock checks lock batches and reject duplicate-line overselling, mismatched medicines, and repeated returns. Failed purchases roll back completely. Cloud invoice numbers use an atomic PostgreSQL sequence. Customer and supplier receipts update balances and allocations transactionally and record an audit entry.

Restores validate tenant ownership and parent references, preserve existing documents, and include purchase lines and audit records. Purchase returns support older stock-ledger schemas. Realtime connections clean up correctly during navigation. The shared responsive glass navigation now works across clinic pages. Heavy route screens and printing load on demand; initial JavaScript decreased from approximately 1.876 MB to 1.289 MB before compression.

Payment-return navigation is now connected to the configured route. Concurrent mounts share verification, transient failures preserve the pending order, and retry is visible. Production builds exclude the query debugging controls. Prescription entry stores the entered text and quantity rather than sample medication data, uploads persist the actual document, and previews use authenticated downloads. Document access, prescription actions, doctor matching, and patient history are scoped to the current organization. Extraction no longer fabricates medicines, doses, quantities, or doctor details. Authentication uses the current account directory rather than stale role or clinic claims, and upstream authentication outages return a retryable response.

Cloud medicines, suppliers, and customers now feed a tenant-scoped, cached reference projection for operational screens. Pending native edits are preserved. Procurement drafts use recorded purchase cost and the medicine tax rate rather than sample values, validate quantity and rate, prevent double submission, and follow the organization timezone for order dates and daily indicators. The overdue automatic browser bill migration was removed; it could erase local bills after partial migration errors. Existing legacy IndexedDB data is preserved and should be reviewed before any manual migration.

## Before submission

Deploy the updated backend and web build together. The Docker runtime now includes the migration SQL files and uses a port consistent with its exposed port. Ensure all pending migrations run successfully, including 015–018. The hosted backend inspected during this work lacked several enterprise routes and database upgrades; a web-only deployment will not deliver these fixes.

Advanced stock-changing workflows still use the embedded engine separately from cloud billing. The reference projection does not synchronize stock, reservations, or financial transactions between these engines. End-to-end GRN, transfer, order fulfillment, stocktake commitment, and cloud stock reconciliation remain release gaps; route rendering and read checks do not establish that these workflows are ready for production.

Keep the embedded database on persistent storage. Set `PRESCRIPTION_STORAGE_PATH` to a private persistent directory shared by the API instances that serve prescription documents; include it in protected backups. The upload implementation was verified locally. Hosted disk durability and multi-instance deployment were not verified.

Run a signed-in smoke test against the actual deployed URL after deployment, including a safe test invoice and its stock movement. Use a dedicated SUPER_ADMIN test account for administrative browser workflows. Live payment-gateway checkout, external invoice scanning, physical printing, container image builds, and native mobile binary builds or device testing were not exercised in this web release pass.

The full ESLint check still reports outstanding type/style violations, including explicit `any` types and effect rules. The project is not lint-clean. Production builds and the listed regression tests pass; this report does not claim every possible workflow or external integration is defect-free.

## Repeat the automated checks

```sh
cd web
npm run build
npm test
cd ../backend
npm run build
LOCAL_DB_PATH=/tmp/medical-regression-tests.db npm test -- --runInBand
```

The real PostgreSQL write tests require `TEST_DATABASE_URL` pointing to a disposable database on localhost with a name ending in `_qa`, with the application schema and migrations applied. Also set `LOCAL_DB_PATH` to an isolated test file. Without `TEST_DATABASE_URL`, those write tests intentionally skip. Never point mutation tests at the production database.

Screenshots contain synthetic local test records: [web dashboard](qa/dashboard-web.jpg) [mobile invoice](qa/billing-mobile.jpg), and [mobile prescription review](qa/prescription-mobile.jpg), and [procurement draft](qa/procurement-draft-web.jpg).
