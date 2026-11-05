# Supplier and reorder workflow

The supplier directory now supports editing contacts, active status, lead time, minimum order value, and future messaging preferences. Search and the active/missing-mobile filters run across the shop directory on the server. Summary amounts are shop-wide rather than totals from the visible page.

Both `/shortbook` and `/inventory/reorder` open the same planner. It combines open shortbook requests with minimum stock and the last 30 days of net sales. The target covers the supplier's recorded lead time plus 14 days; the reorder point uses lead time plus three safety days, or the minimum stock threshold if higher. Orders are prepared in existing inventory stock units. Staff confirm packaging with the supplier; the planner deliberately does not infer pack conversions from descriptive strings.

Expired and disposed batches are excluded. Pending simple and enterprise order quantities are deducted, including unsent drafts. A medicine's manual shortage overlaps its forecast shortage; the larger need is used instead of adding both. No demand or price is invented when history is missing. Available stock within 60 days of expiry is flagged for review.

The planner shows the most recent recorded batch rate per supplier from the last 180 days, with its observation date. Preferred suppliers remain the default when active. The lowest recorded rate is an explicit alternative, not a current quotation. Estimates exclude tax, supplier schemes and delivery. An optional item budget is checked again on the server; it cannot be verified while selected items have unknown supplier rates. Supplier minimum values are warnings so staff can confirm delivery charges rather than overbuy to reach a minimum.

## Saving and receiving

Owners can select medicines, adjust quantities up to the current recommendation, assign suppliers and review grouped orders. Saving creates one `DRAFT` purchase order per supplier and a message snapshot. It does not change inventory or supplier payable balances. After partial delivery, manual follow-up previews show only the remaining quantity; the original saved message snapshot stays unchanged. Requests are hashed and idempotent; all orders, messages and the retry checkpoint commit in one PostgreSQL transaction. A per-clinic transaction lock serializes planner saves, cancellations and linked receipts. Stock and recommendations are revalidated at save time.

Saved drafts and unfulfilled balances on partial deliveries can be cancelled, restoring only their outstanding quantities to the plan while retaining received stock and payable balances. Shortbook entries stay open until receipt. Receive stock opens the existing purchase entry screen with the supplier and ordered medicines linked. Add each actual batch, expiry, purchase price and MRP. Only quantities still on the order can be received. Partial deliveries leave the rest outstanding; full receipt closes the order. Shortbook requests are fulfilled oldest first. Stock, supplier payable, purchase, order quantities and the receipt retry checkpoint commit together. Repeating the same receipt request cannot add stock twice.

The receiving link must be used when fulfilling these orders. An unrelated manual purchase cannot reliably be matched to an outstanding PO. Existing enterprise procurement screens and their approval workflows remain separate.

## Future WhatsApp and SMS integration

Migration `027_supplier_reorder_workspace.sql` adds supplier lead-time/channel/permission fields, `reorder_requests`, `reorder_receipts`, and `supplier_message_drafts`. The normal backend startup migration runner applies it. Deploy the backend migration before the new web client. New tables enable RLS; operational access goes through authenticated, clinic-scoped backend routes.

Today, all message snapshots remain `DRAFT`. Staff can preview and copy them. There is no supplier provider dispatch, scheduled job, or SMS charge in this implementation. Channel selection falls back to manual if a phone number or permission is missing.

`supplierMessaging.ts` defines a versioned order payload, renderer and `SupplierMessageProvider` interface. A future worker should:

- Recheck current supplier channel permission, recipient, tenant, and order status before dispatch; require an explicit dispatch action or enabled automation policy.
- Claim queued rows atomically and reuse the persisted idempotency key when retrying ambiguous provider responses.
- Map provider acceptance to `SENT`; use authenticated, replay-safe callbacks for delivery outcomes.
- Track attempt count, provider message ID, retry time and errors using the existing columns; cap retries and handle non-retryable failures.
- Use provider-approved channel templates as required by the selected provider. Preserve the structured payload; do not assume the manual multiline preview is a valid SMS or WhatsApp API template.
- Cancel queued messages for cancelled orders and avoid sending a stale message after partial receipt.

No provider secrets belong in browser settings or source code.

## Verification

`backend/src/__tests__/reorderPlanner.test.ts` covers demand overlap, coverage, pending quantities, missing history, receipt bounds, input validation and message content. `backend/src/__tests__/integration/reorder.pg.test.ts` uses real PostgreSQL for retry behavior, concurrent orders, budgets, tenant/role boundaries, cancellation, receipt accounting and transactional rollback. It requires a disposable localhost database whose name ends in `_qa` through `TEST_DATABASE_URL`.

Desktop/mobile QA images and the UI scenario result are in `docs/qa/supplier-reorder/`. They use synthetic records in a disposable local database.
