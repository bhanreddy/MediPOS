CREATE TABLE cash_register_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  opened_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  opening_request_id uuid NOT NULL,
  opening_paise bigint NOT NULL CHECK (opening_paise >= 0),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  closing_paise bigint CHECK (closing_paise >= 0),
  closing_report jsonb,
  UNIQUE (clinic_id, opening_request_id),
  CHECK (
    num_nonnulls(closed_at, closed_by, closing_paise, closing_report) IN (0, 4)
  )
);
CREATE UNIQUE INDEX cash_register_open_employee_store
  ON cash_register_sessions (clinic_id, store_id, opened_by) WHERE closed_at IS NULL;

CREATE TABLE cash_register_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES cash_register_sessions(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('CASH_IN', 'CASH_OUT', 'DROP', 'EXPENSE')),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, request_id)
);

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES clinics(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS register_session_id uuid REFERENCES cash_register_sessions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS original_payment_id uuid REFERENCES payment_transactions(id) ON DELETE RESTRICT,
  ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE payment_transactions ADD CONSTRAINT payment_transaction_tenant
  CHECK (num_nonnulls(clinic_id, organization_id) > 0) NOT VALID;
CREATE INDEX payment_register_session ON payment_transactions(register_session_id)
  WHERE register_session_id IS NOT NULL;
CREATE INDEX payment_original_allocation ON payment_transactions(original_payment_id)
  WHERE original_payment_id IS NOT NULL;

ALTER TABLE cash_register_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_register_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cash_register_sessions, cash_register_movements FROM PUBLIC;
CREATE TRIGGER immutable_register_movement BEFORE UPDATE OR DELETE ON cash_register_movements
  FOR EACH ROW EXECUTE FUNCTION reject_phase1_financial_change();
