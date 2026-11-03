# Billing fetching changes

The web POS uses `/inventory/medicines/search` and `/sales`. The separate counter engine uses `/pos/search`. Both search paths now fetch stock in bulk. The web POS reuses search batch data when adding items, and reuses the inserted sale rows plus cart metadata for printing. Checkout still validates stock, disposal and expiry on the server.

Search accepts `limit` (default 25, maximum 100) and `include_substitutes=false` to omit unused substitute lookups. Invoice listing accepts `q` for invoice number, customer name or payment mode, along with its existing date and pagination parameters. Invoice summary cards explicitly describe the current page.

Apply `backend/migrations/014_billing_fetch_indexes.sql` through the application's PostgreSQL migration process. This change does not apply that migration to a running database. SQLite search indexes are created automatically during backend startup, including for existing installations.

## Billing latency improvements (October 2026)

- Search debounces for 80 ms, keeps matching suggestions visible as you type, and reuses recent exact searches through React Query. Cache keys include the operator and clinic (including impersonation); suggestions cannot cross those scopes. Barcode input now searches too. Sale confirmation clears the search snapshots so sold stock is not reused.
- POS search with `include_substitutes=false` gets the bounded medicine page and sellable FEFO batches in one PostgreSQL query. The optional substitute workflow is unchanged.
- Apply migration `019_billing_search_performance.sql` for substring-search trigram indexes, barcode lookup, current subscription and daily billing usage. Deploy the backend changes as well as the web build. The local frontend currently calls the hosted Render backend; frontend hot reload cannot update that server or its indexes.
- The server still locks batches and commits the complete sale before replying. Sale items and ledger movements use bulk inserts, and batch balances use one bulk update. Ten lines now need three line/stock/ledger write queries rather than thirty. Subscription, plan and usage checks use one database query instead of three HTTP requests, without caching billing permissions or bypassing limits.
- The bill clears immediately after server confirmation. Receipt preparation and view refreshes run separately and cannot keep the next bill locked. Header, UPI and receipt profile reads share a short, session-scoped cache; receipt code warms while building a bill. Printing errors cannot turn a saved sale into a failed sale.

Browser QA with a simulated 300 ms search response and 3-second print delay measured matching suggestions in 16 ms, cached repeat search in 14 ms, and the bill ready 108 ms after the save response. These are local UI measurements, not production checkout latency. No actual customer sales were created for browser QA.

Real PostgreSQL tests ran against a disposable local database: one-query search, a ten-line committed sale, combined quantities for duplicate batch lines, concurrent oversell prevention, and rollback after ledger failure all passed. Run `src/__tests__/integration/billingPerformance.pg.test.ts` with `TEST_DATABASE_URL` pointing to a localhost database ending in `_qa` with the application schema and relevant migrations applied. Never use a production database for mutation tests.

Sale creation through `/sales` has automatic HTTP retries disabled because this endpoint does not provide transactional idempotent replay. The web POS also prevents simultaneous submissions from clicks and keyboard shortcuts. If saving fails, review the invoice list before manually submitting an uncertain sale again.

Verification:

```sh
cd backend
npm run typecheck
npm test -- --runInBand src/__tests__/services/posSearch.test.ts src/__tests__/services/saleReferences.test.ts src/__tests__/salesFetching.test.ts src/__tests__/inventorySearchFetching.test.ts src/__tests__/lib/money.test.ts

# Existing counter integration suite; always use an isolated SQLite database.
LOCAL_DB_PATH=:memory: DATABASE_URL=postgres://localhost:5432/medical_test JWT_SECRET=test_secret_for_jwt_testing_1234567890 npm test -- --runInBand src/__tests__/posCounterEngine.test.ts

cd ../web
npm run test:billing
npm run build
```

The ordinary fetching tests mock the database driver; the optional PostgreSQL integration suite exercises actual commits and rollback. Validate query plans against the target dataset before rollout; production request latency still depends on hosting, database location, data volume and network.
