-- Keep the original movement types and admit the existing reconciliation and
-- transfer variance operations now writing through PostgreSQL.
ALTER TABLE stock_ledger DROP CONSTRAINT IF EXISTS stock_ledger_movement_type_check;
ALTER TABLE stock_ledger ADD CONSTRAINT stock_ledger_movement_type_check CHECK (
  movement_type IN (
    'OPENING_STOCK','SALE','SALE_RETURN','PURCHASE_RECEIPT','PURCHASE_RETURN',
    'TRANSFER_OUT','TRANSFER_IN','ADJUSTMENT_PLUS','ADJUSTMENT_MINUS','DAMAGE',
    'EXPIRY','DISPOSAL','RECALL','STOCKTAKE_CORRECTION','RESERVATION',
    'RESERVATION_RELEASE','WAREHOUSE_RECEIPT','WAREHOUSE_DISPATCH',
    'RECONCILIATION_CORRECTION','TRANSFER_SHORTAGE','TRANSFER_EXCESS_ADJUSTMENT'
  )
);

ALTER TABLE sale_return_credit_notes ADD COLUMN IF NOT EXISTS refund_reference text;

-- Some databases have the original commercial tables without the legacy
-- operation flags supplied by the later CREATE TABLE IF NOT EXISTS migration.
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['promotions','promotion_applications','promotion_targets','promotion_rewards'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS _deleted smallint NOT NULL DEFAULT 0', relation);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS _synced smallint NOT NULL DEFAULT 0', relation);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS _updated_at timestamptz NOT NULL DEFAULT now()', relation);
  END LOOP;
END $$;
