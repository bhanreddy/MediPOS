ALTER TABLE stocktake_counts ADD COLUMN IF NOT EXISTS counter_role text NOT NULL DEFAULT 'COUNTER_A';
-- Every retried count uses its existing id primary key. Never sum a retry twice.
CREATE INDEX IF NOT EXISTS phase1_stocktake_count_roles ON stocktake_counts(stocktake_item_id,counter_role,user_id);
