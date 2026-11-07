ALTER TABLE parked_sales
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_sale_id uuid REFERENCES sales(id) ON DELETE RESTRICT;

CREATE TABLE counter_discount_limits (
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  max_basis_points integer NOT NULL CHECK (max_basis_points BETWEEN 0 AND 10000),
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, user_id)
);

CREATE TABLE counter_discount_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  cashier_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  checkout_request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  discount_paise bigint NOT NULL CHECK (discount_paise > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  sale_id uuid UNIQUE REFERENCES sales(id) ON DELETE RESTRICT,
  UNIQUE (clinic_id, cashier_id, checkout_request_id, fingerprint),
  CHECK (num_nonnulls(approved_by, approved_at) IN (0, 2))
);

CREATE TABLE counter_sale_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('DISCOUNT', 'MANUAL_BATCH')),
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sale_voids (
  sale_id uuid PRIMARY KEY REFERENCES sales(id) ON DELETE RESTRICT,
  reversal_id uuid NOT NULL UNIQUE REFERENCES sales(id) ON DELETE RESTRICT,
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  approved_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  restock boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE counter_discount_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE counter_discount_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE counter_sale_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_voids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON counter_discount_limits, counter_discount_requests, counter_sale_audit, sale_voids FROM PUBLIC;
CREATE TRIGGER immutable_counter_audit BEFORE UPDATE OR DELETE ON counter_sale_audit
  FOR EACH ROW EXECUTE FUNCTION reject_phase1_financial_change();
CREATE TRIGGER immutable_void_record BEFORE UPDATE OR DELETE ON sale_voids
  FOR EACH ROW EXECUTE FUNCTION reject_phase1_financial_change();
