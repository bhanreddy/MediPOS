# Nex Coins

Nex Coins are earned automatically by a saved customer in one medical store. There is no manual issuance or manual balance-editing API. One Nex Coin offsets ₹1 on a bill, but coins cannot be transferred or withdrawn as cash.

The default earning rate is **10%** of the amount paid after discounts and coin redemptions, with a **90-day** expiry. A ₹50 paid sale therefore earns 5 Nex Coins, taking an existing 10-coin balance to 15. Spending coins does not earn further coins on that redeemed value. Credit invoices earn when fully paid; existing returns are excluded from the eligible amount.

## Owner controls

Open **Customers → Nex Coins rules**, or the same action in a customer's history. Owners can pause earning, choose a rate between 5% and 10%, and set:

- Minimum sale amount required to earn (default ₹0).
- Maximum coins earned on one bill (default 0, meaning no cap).
- Maximum bill percentage payable with Nex Coins (default 100%).

The validity for future awards defaults to 90 days and can be set between 1 and 365 days. Existing deadlines cannot be edited. Every rule change requires a reason and appends a signed policy version; stale edits are rejected. Cashiers and pharmacists can use coins on fully settled bills but cannot change the rules or mint coins.

## Earning, use and returns

The server enforces thresholds and computes amounts in integer minor units. Nearest-expiring eligible coins are redeemed first. Expired coins are unavailable immediately, even before a housekeeping expiry event is posted. Billing, customer history, receipts and the coin ledger show earned and redeemed amounts separately from money collected. Payment reports separate coin and external tenders, and profit/accounting summaries include redeemed coins net of returns as promotional cost.

Invoice, stock, redemption and earning commit in the same PostgreSQL transaction. Stable checkout and return identifiers prevent duplicate movements and reject changed replays. A return restores the coin-funded portion to its original awards and original deadlines; expired or previously revoked restored credits cannot become cash.

Returns recalculate the original earning rules, including the minimum sale and per-bill cap. Unused expired earnings are not charged again. If earned coins have already been spent, a signed return adjustment offsets available or future coin earnings; it does not withdraw cash. Debt offsets are deterministic and recorded, so the same adjustment is not charged twice.

## Integrity boundary

Balances are derived from an append-only ledger; there is no editable balance column. HMAC signatures cover the store, customer, staff identity, amount, deadline, source invoice, earning policy and previous record hash. A signed account head and full-chain verification block spending when ordinary edits, missing entries or cross-account replay are detected. Legacy signature versions remain supported; new reward records use version 3.

PostgreSQL rejects ledger/operation/policy updates, deletion and truncation. Browser roles have no privileges, and row-level security has no public policies. Owners cannot bypass these restrictions through the application. The independent `WALLET_LEDGER_SECRET` must stay in the backend environment with a secure backup; never put it in frontend variables or rotate it without a signing-key migration.

This is tamper-evident application protection, not an absolute guarantee against an administrator controlling both the database and signing key. Detecting a coordinated replay of a complete historical database snapshot requires an external trusted checkpoint. Retain independent database and key backups.

## Validation

`wallet.pg.test.ts` and `nexCoins.pg.test.ts` allow writes only to disposable localhost databases ending in `_qa`. They cover the exact 10 → 15 example, all thresholds, cash/credit/coin-funded bills, policy authorization and stale versions, expiry, partial returns and rounding, spent-reward adjustments, immutability, RLS, concurrent spending, idempotency and transaction rollback. Browser QA uses the real local API with synthetic records; sample coins and bills must not be created in the live medical store.
