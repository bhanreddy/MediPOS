ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS creation_request_hash text;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS dispatch_request_id text;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS dispatch_request_hash text;
ALTER TABLE transfer_receipts ADD COLUMN IF NOT EXISTS request_hash text;

-- Store-level inventory positions are authoritative where they exist. A legacy
-- unassigned batch belongs to one default store, never to all branches.
CREATE VIEW branch_stock_snapshot WITH (security_invoker = true) AS
WITH defaults AS (
  SELECT DISTINCT ON (clinic_id) clinic_id, id
  FROM stores WHERE clinic_id IS NOT NULL AND status = 'active' AND deleted_at IS NULL
  ORDER BY clinic_id, created_at, id
), positions AS (
  SELECT store_id, batch_id, SUM(quantity_on_hand)::int AS on_hand,
    SUM(GREATEST(0, quantity_on_hand - quantity_reserved - quantity_quarantined - quantity_damaged
      - quantity_recalled - quantity_on_hold - quantity_stocktake_locked))::int AS available
  FROM inventory_positions
  WHERE store_id IS NOT NULL AND location_type = 'STORE' AND deleted_at IS NULL
  GROUP BY store_id,batch_id
), stock AS (
  SELECT p.store_id, p.batch_id, p.on_hand, p.available FROM positions p
  UNION ALL
  SELECT COALESCE(b.store_id, d.id), b.id, b.quantity_remaining, b.quantity_remaining
  FROM medicine_batches b LEFT JOIN defaults d ON d.clinic_id=b.clinic_id
  WHERE b.deleted_at IS NULL AND COALESCE(b.store_id,d.id) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM positions p WHERE p.batch_id=b.id AND p.store_id=COALESCE(b.store_id,d.id)
    )
)
SELECT b.id AS batch_id, s.store_id, b.clinic_id, b.medicine_id,
  b.batch_number, b.expiry_date, b.mrp, b.purchase_price, GREATEST(0,s.on_hand) AS on_hand,
  CASE WHEN b.is_disposed OR COALESCE(b.is_recalled,false)
    OR b.expiry_date IS NULL OR b.expiry_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
    OR EXISTS (SELECT 1 FROM product_recalls r WHERE r.product_id=b.medicine_id
      AND r.status='ACTIVE' AND r.deleted_at IS NULL AND (r.batch_id IS NULL OR r.batch_id=b.id))
  THEN 0 ELSE GREATEST(0,LEAST(s.available,b.quantity_remaining)) END AS available
FROM stock s JOIN medicine_batches b ON b.id=s.batch_id AND b.deleted_at IS NULL
JOIN stores st ON st.id=s.store_id AND st.clinic_id=b.clinic_id AND st.status='active' AND st.deleted_at IS NULL;

REVOKE ALL ON branch_stock_snapshot FROM PUBLIC;
