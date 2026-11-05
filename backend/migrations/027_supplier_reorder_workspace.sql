ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS lead_time_days integer NOT NULL DEFAULT 5 CHECK (lead_time_days BETWEEN 1 AND 90),
  ADD COLUMN IF NOT EXISTS minimum_order_value numeric NOT NULL DEFAULT 0 CHECK (minimum_order_value >= 0),
  ADD COLUMN IF NOT EXISTS preferred_channel text NOT NULL DEFAULT 'MANUAL' CHECK (preferred_channel IN ('MANUAL', 'WHATSAPP', 'SMS')),
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false;

-- A retry returns the same orders; a clinic lock also serializes different requests.
CREATE TABLE IF NOT EXISTS reorder_requests (
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  result_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, request_id)
);

-- Reviewable message snapshots, deliberately never queued or sent automatically.
-- A future provider worker can own dispatch, attempts, callbacks and delivery state.
CREATE TABLE IF NOT EXISTS supplier_message_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  channel text NOT NULL CHECK (channel IN ('MANUAL', 'WHATSAPP', 'SMS')),
  recipient text,
  template_key text NOT NULL DEFAULT 'supplier_purchase_order_v1',
  payload_json jsonb NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED')),
  idempotency_key text NOT NULL UNIQUE,
  provider text,
  provider_message_id text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, purchase_order_id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_message_drafts_clinic ON supplier_message_drafts(clinic_id, created_at DESC);
ALTER TABLE reorder_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_message_drafts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS reorder_receipts (
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id),
  purchase_id uuid NOT NULL REFERENCES purchases(id),
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, request_id)
);
ALTER TABLE reorder_receipts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reorder_batch_rates
  ON medicine_batches (clinic_id, medicine_id, supplier_id, created_at DESC)
  WHERE deleted_at IS NULL;
