# Phase 2 implementation plan

The current counter screen uses the main sales API. The alternate POS router already has parked bills, payment rows and supervisor authorization. The main sales path does not yet record tender rows or drawer activity. Existing cart state supports discounts and manual batches, but the main counter does not expose those controls. No cash register lifecycle or completed invoice cancellation exists.

1. Add a PostgreSQL migration for drawer sessions and movements, tender-to-shift and refund references, and counter audit records. Reuse payment transactions, stores, users, and the original invoice.
2. Add authenticated drawer routes and a counter dialog for opening float, movements, X reports, counted close and Z reports. Lock the session for movements, settlement and close.
3. Extend sales and refunds with paise tender allocation, shift and original payment references, stable checkout identity, employee discount policy and one-use approvals. Record manual batch selection. Implement authorized voids through the existing transactional reversal path.
4. Reuse parked-sale storage and POS cart state for parking, search, recovery and checkout. Claim and complete the draft under a PostgreSQL row lock. Expose eligible batch options using the same stock rules as checkout.
5. Modify the sales/legacy POS and billing history routes and UI in focused units. Add real PostgreSQL coverage for concurrency, shift totals, split and credit settlement, original refund allocation, approval replay, park/resume, manual batch selection and cancellation. Exercise the web workflow in Chrome and rerun backend, web and mobile regressions.

Keep older API clients working during the drawer transition. Modern cash checkout will require an open shift. Historical payments without individual tender rows remain distinguishable from new tracked settlements. Production deployment and production database changes are outside the implementation run.
