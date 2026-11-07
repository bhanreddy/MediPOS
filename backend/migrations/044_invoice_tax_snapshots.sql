ALTER TABLE sales ADD COLUMN IF NOT EXISTS invoice_snapshot jsonb;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS invoice_line_snapshot jsonb;

CREATE TABLE clinic_tax_document_sequences (
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  series text NOT NULL CHECK (series IN ('S', 'R')),
  fiscal_year integer NOT NULL,
  sequence_number bigint NOT NULL CHECK (sequence_number BETWEEN 1 AND 9999999999),
  PRIMARY KEY (clinic_id, series, fiscal_year)
);
ALTER TABLE clinic_tax_document_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clinic_tax_document_sequences FROM PUBLIC;

-- Older invoice snapshots remain NULL and are never backfilled from mutable catalogue values.
