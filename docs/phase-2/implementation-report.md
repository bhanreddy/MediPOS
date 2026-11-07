# Medical POS Phase 2

## A. Phase summary

The primary web counter now handles drawer opening and close, split tenders, parked bills, manual batch selection, employee discount limits, supervisor approval, and invoice voids. Settlement, stock, audit entries and the final invoice commit in the same PostgreSQL transaction.

## B. Files changed

- Migrations `backend/migrations/040_counter_register_and_tenders.sql`, `041_counter_drafts_and_approvals.sql`, and `042_counter_park_receipts.sql`.
- API and validation in `backend/src/routes/index.ts`, `register.ts`, `counter.ts`, `sales.ts`, `pos.ts`, and `backend/src/schemas/sale.schema.ts`.
- Domain logic in `backend/src/services/cashRegister.ts`, `saleTenders.ts`, `parkedSales.ts`, `counterDiscounts.ts`, `cloudSaleAllocation.ts`, and `cloudSaleReturns.ts`.
- Counter UI in `web/src/components/clinic/WebPos.tsx`, `RegisterDialog.tsx`, `CounterDialogs.tsx`, `BillingSalesListPage.tsx`, `SaleReturnDialog.tsx`, and `SaleVoidDialog.tsx`. Checkout request construction in `web/src/services/billingService.ts`.
- Tests in `backend/src/__tests__/integration/phase2Counter.pg.test.ts`, `billingPerformance.pg.test.ts`, `backend/scripts/test-phase2-browser.cjs`, and `backend/scripts/test-phase1-browser.cjs`.
- Phase plan and report in `docs/phase-2/`. No files removed.

## C. Database changes

040 adds drawer sessions, counted opening and close values, immutable cash movements, and individual tender links to the drawer and original payment. 041 adds draft completion/cancellation references, employee discount limits, one-use approval records, append-only audit and linked void reversals. 042 retains a receipt for every park or re-park request. Existing invoice rows and tender history are preserved. A rollback after live writes would have to preserve new financial records and reconcile their effect before reverting the application.

## D. APIs changed

- `/api/register` supports active shift, history, open, report, movements and close.
- `/api/counter` supports employee discount limits and cashier/owner approval requests. Approval is bound to a specific cashier, cart, checkout identifier and store.
- `/api/sales` accepts paise-based payment allocations and an optional parked bill ID. Eligible batches are listed at `GET /api/sales/medicine/:id/batches`. Checkout still rechecks availability. `POST /api/sales/:id/void` requires an owner and a cancellation reason.
- Existing return endpoints show and record allocations. Existing invoice reads expose tender details and cancellation history. The existing `/api/pos/park` and `/api/pos/parked` paths retain and recover drafts. Older checkout clients remain compatible and record against an active drawer when one exists.

## E. Features verified

A ₹1,000 Cash + UPI sale was recorded as ₹400 cash and ₹600 UPI. A concurrent retry produced one invoice. An original-method refund reversed both allocations and drawer reports reconciled the refund, opening float, movements and closing variance. Cash plus credit posted the exact outstanding balance. A single cashier could claim a parked draft, and parking never changed stock. A cashier selected a different eligible batch and resumed and edited that bill in Chrome. A changed bill could not reuse an owner's discount approval. An owner voided the original invoice through sales history and the linked reversal restored only the selected stock.

## F. Testing results

- `npm --prefix backend run build` and `node backend/scripts/setup-qa.cjs` passed against a fresh local PostgreSQL 17 database.
- `npm --prefix backend test -- --runInBand` passed 906 tests, including the four Phase 2 PostgreSQL scenarios. The four external Supabase tests were skipped because test credentials were absent.
- `npm --prefix web test` passed 127 tests. `npm --prefix web run build` passed.
- `node --test mobile/tests/*.test.cjs` passed 41 tests. No device workflow was run.
- `node backend/scripts/test-phase2-browser.cjs` passed in Chrome against the local API and PostgreSQL. It exercised opening and closing, batch selection, park and resume, owner approval in a separate session, Cash + UPI, and void.
- `git diff --check` passed.

## G. Remaining limits

Phase 2 cash enforcement applies to the current web counter and callers that opt into the register contract. Older clients may still post legacy cash sales without a drawer. The new controls record in-person settlement and do not move external card or UPI funds. Historical transactions without tender details use the invoice method for refund recording. An invoice with a prior return must use the remaining return workflow. External Supabase integration and packaged desktop replay remain unverified.

## H. Phase 2 exit criteria

1. **PASSED** — Split payments reconcile, including references, concurrent retries and reversals.
2. **PASSED** — Parked bills preserve the cart and can be edited on resume without deducting stock early.
3. **PASSED** — Manual switching rejects unavailable batches and records the override.
4. **PASSED** — Employee limits and exact one-use owner approvals are enforced on checkout.
5. **PASSED** — A counted opening float is required and closing produces an X/Z reconciliation with variance.
6. **PASSED** — Authorized cancellation preserves the invoice, produces payment and inventory reversals, and records the approver.
7. **PASSED** — Configured billing regressions passed.

## I. Risk assessment

Older devices need the current register contract before their cash transactions can be required to belong to a drawer. Reconcile historical tender gaps before using register reports as a comparison for past transactions.

## J. Next phase readiness

Phase 2 acceptance is verified locally. Phase 3 can build on the canonical checkout, invoice and audit records.
