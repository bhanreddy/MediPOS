CREATE TABLE counter_park_receipts (
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  parked_sale_id uuid NOT NULL REFERENCES parked_sales(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, request_id)
);
ALTER TABLE counter_park_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON counter_park_receipts FROM PUBLIC;
CREATE TRIGGER immutable_park_receipt BEFORE UPDATE OR DELETE ON counter_park_receipts
  FOR EACH ROW EXECUTE FUNCTION reject_phase1_financial_change();
