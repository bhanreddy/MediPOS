# Phase 4 implementation plan

The PostgreSQL transfer lifecycle is already present from Phase 1. It still allows some organization memberships to bypass store grants, and partial receipts need stronger transition and replay controls. Main checkout can resolve a store, but the web shell has no selector and some inventory reads aggregate other branches.

1. Add a store access directory and validate the selected store on each authenticated request. Persist the choice by user and clinic in the web shell, keep branch carts separate, and scope inventory, purchases, sales history, registers and prescription setup.
2. Add a PostgreSQL view of store stock from inventory positions with a conservative fallback for legacy batches. Use it for POS search, sister-store discovery, and branch reporting. Sister-store discovery returns only authorized branches and offers a transfer request.
3. Harden the existing transfer services with participant access checks, stage locks and distinct dispatch and receipt identities. Verify source reservation, dispatch, partial receipt, rejection, cancellation and ledger balances. No duplicate transfer engine.
4. Add owner chain analytics for consolidated and branch sales, stock value, costs and profitability, suppliers and transfers. Verify branch isolation with synthetic multiple stores, real PostgreSQL transactions and Chrome.
