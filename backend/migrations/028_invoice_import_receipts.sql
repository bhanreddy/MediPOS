-- One invoice file is one receipt. Written in the same transaction as stock.
CREATE TABLE IF NOT EXISTS invoice_import_receipts (
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  source_sha256 text NOT NULL,
  source_filename text NOT NULL,
  source_format text NOT NULL CHECK (source_format IN ('csv', 'xlsx', 'pdf')),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  invoice_number text NOT NULL,
  purchase_id uuid NOT NULL REFERENCES purchases(id),
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, request_id),
  UNIQUE (clinic_id, source_sha256),
  UNIQUE (clinic_id, supplier_id, invoice_number)
);
ALTER TABLE invoice_import_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS free_quantity integer NOT NULL DEFAULT 0;
