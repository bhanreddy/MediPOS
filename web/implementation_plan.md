# Medical Shop POS - Implementation Plan

## Status: Core Logic Ready (Environment Fixed)

## Architecture: Offline-First
- **Runtime Source of Truth**: IndexedDB (via Dexie.js).
- **Sync/Backup**: Supabase (Skeleton ready, credentials needed).
- **Traceability**: AuditLogs implemented for all mutations.

## Schema Standard
- **Products**: `id`, `name`, `composition`, `min_stock_alert`.
- **Batches**: `expiry_date`, `mrp`, `quantity` (Inventory Source of Truth).
- **Sales**: `invoice_number`, `total_amount`, `payment_mode`, `is_paid`.
- **AuditLogs**: Logs `CREATE`, `UPDATE`, `DELETE`, `SYNC` actions.

## Implemented Services
1.  **InventoryService**: Adds products/batches, validates stock.
2.  **BillingService**: Creates sales, atomic transaction for stock deduction.
3.  **AuditService**: Zero-dependency logging.

## Verification
- Run `npm run dev`.
- The main screen is currently the **Verification Dashboard**.
- Click **"Run Core Logic Verification"** to execute the test suite (Supplier -> Product -> Batch -> Sale -> Stock Check).

## Next Steps
1.  **User Verification**: Confirm the logs in the browser console/UI show "VERIFICATION PASS".
2.  **UI Development**:
    - Build `POSScreen` (Billing).
    - Build `InventoryManager` (Stock Entry).
    - Build `SalesHistory`.
3.  **Supabase Integration**: Connect real backend.
