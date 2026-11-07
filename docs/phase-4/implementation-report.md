# Medical POS Phase 4

## A. Phase summary

The web counter can select an authorized branch and use its stock, billing, drawer, prescription, and purchase context. The existing PostgreSQL transfer workflow now checks source and destination permissions at the relevant steps and handles partial receipt and safe retries. The POS can find stock at authorized sister stores and send a request. Owners can compare operations across the chain.

## B. Files changed

- `backend/migrations/045_branch_inventory_and_transfer_replay.sql`.
- `backend/src/app.ts`, `backend/src/lib/tenantContext.ts`, `backend/src/middleware/auth.ts`, `backend/src/middleware/storeAccess.ts`, and `backend/src/routes/index.ts`.
- `backend/src/routes/branches.ts`, `inventory.ts`, `purchases.ts`, `reports.ts`, `sales.ts`, and `transfers.ts`.
- `backend/src/services/batchDisposal.ts`, `branchAnalytics.ts`, `cloudSaleAllocation.ts`, `cloudStoreContext.ts`, `invoiceSnapshot.ts`, and transfer services `locationService.ts`, `stockTransferService.ts`, `transferAllocationService.ts`, `transferDispatchService.ts`, and `transferReceivingService.ts`.
- `web/src/components/clinic/BranchAnalyticsPanel.tsx`, `BranchSelector.tsx`, `ClinicLayout.tsx`, `ClinicSidebar.tsx`, `ReportsHubPage.tsx`, `SisterStoresDialog.tsx`, and `WebPos.tsx`. Also `web/src/components/Transfers/TransfersCommandCenter.tsx`, `web/src/lib/api.ts`, `auth.ts`, `branchSelection.ts`, `web/src/services/offlineCommandService.ts`, and `web/tests/auth-session.test.cjs`.
- `backend/src/__tests__/integration/phase4Branches.pg.test.ts`, `backend/scripts/serve-phase1-qa.cjs`, and `backend/scripts/test-phase4-browser.cjs`. The phase plan and report are in `docs/phase-4/`.

## C. Database changes

Migration 045 adds a branch stock view and fingerprints for new transfer creation, dispatch, and receipt requests. The view uses the branch inventory position first and assigns unpositioned legacy stock to its explicit store or the clinic's oldest active store. Reservations, holds, quarantines, recalls, damage, expiry, and disposal affect availability. Existing transfer and stock ledger records remain in place.

## D. APIs changed

- Added `GET /api/branches/accessible`, `GET /api/branches/sister-stock/:id`, `POST /api/branches/sister-stock/:id/request`, and owner-only `GET /api/branches/analytics`.
- Cloud endpoints validate any supplied `x-store-id` against the current clinic and actor's grants. Inventory, sales, purchase history, dashboards, drawers, parked bills, and dispensing use the resolved store on the scoped paths.
- Existing `/api/transfers` routes filter lists, KPIs, and detail by access. Approvals reserve at the source, dispatch deducts it, and receipt posts only the accepted destination quantity. Create, dispatch, and receipt use separate retry identities.

## E. Features completed

- Browser users can switch stores from the header and navigation, retain their selection on reload, and park an active basket before switching. Offline commands retain the originating branch.
- POS displays authorized sister-store availability. Owners and pharmacists can see batch details and request unregulated stock. Cashiers see quantity summaries for stores they can access.
- Reports show consolidated and branch sales, returns, stock valuation, cost of goods, operating contribution, supplier purchases, and transfers. Legacy cost uses the batch cost currently recorded.

## F. Testing results

- `npm --prefix backend run build` and migration setup on PostgreSQL 17 passed.
- `npm --prefix backend test -- --runInBand` with a fresh migrated database passed 924 tests. Four external Supabase tests skipped.
- Phase 4 real PostgreSQL tests passed branch permission and analytics checks, duplicate transfer operations, reservation and cancellation, and partial receipts. For an eight-unit transfer, source stock went from 20 to 12. Destination stock went from 0 to 3 and then 8. Ledger deltas were −8, +3, and +5.
- `npm --prefix web test` passed 127 tests, the production Vite build passed, and `node --test mobile/tests/*.test.cjs` passed 41 tests. The mobile package has no npm test script.
- Chrome confirmed the branch switch, stock and batch change, reload persistence, park-before-switch workflow, sister-store request, and forged store rejection. The first run had a selector timing race. The corrected run passed.

## G. Remaining limits

Browser QA covered the POS and branch switch. Transfer dispatch and receipt were verified through the real API and database. The native mobile interface has no branch picker. Shared clinic accounts remain clinic-wide. The legacy batch disposal mutation still represents a batch-wide action. Phase 5 hardened the disposal action and added shared-batch and warehouse permission tests. See the [Phase 5 report](../phase-5/implementation-report.md). The dashboard's profitability measure is operating contribution from recorded sales, cost, and expenses. It excludes unallocated overhead and may use estimates for older invoices.

## H. Acceptance criteria

- Authorized web branch switching and reload persistence — PASSED.
- Dispatch deducts source-store inventory — PASSED.
- Receipt updates destination inventory — PASSED.
- Transfer traceability, retry checks, and partial receipts — PASSED.
- POS sister-store availability — PASSED.
- Negative permission tests for branch selection, POS inventory, invoices, and transfer participant actions — PASSED.

## I. Risk assessment

Legacy batches with no explicit branch require an operational review if the oldest store differs from the actual holding site. Cold-chain and regulated transfer approvals still rely on the established transfer workspace and physical workflow. Operating contribution depends on complete branch attribution.

## J. Next phase readiness

The Phase 4 workflows are ready for review and local load testing. Phase 5 covers performance, restoration, and release gates.
