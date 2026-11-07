ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS doctor_address_snapshot text;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS written_date date;

CREATE TABLE pharmacy_dispensing_settings (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE RESTRICT,
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  schedule_x_licence text,
  schedule_x_secure_storage boolean NOT NULL DEFAULT false,
  changed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pharmacy_registrations (
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  registration_number text NOT NULL,
  registration_authority text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  valid_until date,
  verified_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id)
);

CREATE TABLE regulated_dispensing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL UNIQUE REFERENCES sales(id) ON DELETE RESTRICT,
  prescription_id uuid NOT NULL UNIQUE REFERENCES prescriptions(id) ON DELETE RESTRICT,
  pharmacist_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  physical_register_reference text NOT NULL CHECK (length(trim(physical_register_reference)) > 0),
  signed_rx_hash text NOT NULL,
  document_key text NOT NULL REFERENCES app_prescription_documents(storage_key) ON DELETE RESTRICT,
  evidence jsonb NOT NULL,
  supplied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, physical_register_reference),
  UNIQUE (clinic_id, signed_rx_hash)
);

CREATE TABLE regulated_dispensing_lines (
  sale_item_id uuid PRIMARY KEY REFERENCES sale_items(id) ON DELETE RESTRICT,
  dispensing_id uuid NOT NULL REFERENCES regulated_dispensing(id) ON DELETE RESTRICT,
  prescription_item_id uuid NOT NULL REFERENCES prescription_items(id) ON DELETE RESTRICT,
  classification text NOT NULL CHECK (classification IN ('PRESCRIPTION','SCHEDULE_H','SCHEDULE_H1','SCHEDULE_X')),
  medicine_id uuid NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES medicine_batches(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  evidence jsonb NOT NULL,
  retain_at_least_until date NOT NULL
);
CREATE INDEX regulated_dispensing_clinic_date ON regulated_dispensing(clinic_id, supplied_at);
CREATE INDEX regulated_dispensing_line_header ON regulated_dispensing_lines(dispensing_id);

ALTER TABLE pharmacy_dispensing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulated_dispensing ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulated_dispensing_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pharmacy_dispensing_settings, pharmacy_registrations, regulated_dispensing, regulated_dispensing_lines FROM PUBLIC;
CREATE TRIGGER immutable_dispensing_header BEFORE UPDATE OR DELETE ON regulated_dispensing
  FOR EACH ROW EXECUTE FUNCTION reject_phase1_financial_change();
CREATE TRIGGER immutable_dispensing_line BEFORE UPDATE OR DELETE ON regulated_dispensing_lines
  FOR EACH ROW EXECUTE FUNCTION reject_phase1_financial_change();

-- This check is deferred so that an invoice line and its audit entry can be written together.
CREATE OR REPLACE FUNCTION phase1_guard_dispensing() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE product medicines%ROWTYPE; invoice sales%ROWTYPE;
BEGIN
  SELECT * INTO invoice FROM sales WHERE id=NEW.sale_id;
  SELECT * INTO product FROM medicines WHERE id=NEW.medicine_id FOR SHARE;
  IF NOT FOUND OR product.deleted_at IS NOT NULL OR product.clinic_id IS DISTINCT FROM invoice.clinic_id
    OR NEW.clinic_id IS DISTINCT FROM invoice.clinic_id THEN
    RAISE EXCEPTION 'Sale item medicine and invoice must belong to the same clinic' USING ERRCODE='23514';
  END IF;
  IF COALESCE(invoice.is_return,false) THEN RETURN NEW; END IF;
  IF (COALESCE(product.prescription_required,false) OR COALESCE(product.is_schedule_h1,false)
      OR COALESCE(product.schedule_classification,'NONE') <> 'NONE') AND NOT EXISTS (
    SELECT 1 FROM regulated_dispensing d
    JOIN regulated_dispensing_lines l ON l.dispensing_id=d.id
    JOIN users u ON u.id=d.pharmacist_id AND u.role='PHARMACIST' AND u.clinic_id=invoice.clinic_id
    JOIN prescriptions rx ON rx.id=d.prescription_id AND rx.patient_id=d.patient_id
    JOIN prescription_items ri ON ri.id=l.prescription_item_id AND ri.prescription_id=rx.id
    WHERE d.sale_id=invoice.id AND d.clinic_id=invoice.clinic_id AND d.store_id=invoice.store_id
      AND d.pharmacist_id=invoice.served_by AND d.patient_id=invoice.customer_id
      AND l.sale_item_id=NEW.id AND l.medicine_id=NEW.medicine_id AND l.batch_id=NEW.batch_id AND l.quantity=NEW.quantity
      AND ri.matched_product_id=NEW.medicine_id
      AND l.classification=CASE
        WHEN product.schedule_classification='NARCOTIC' THEN 'BLOCKED'
        WHEN product.schedule_classification='SCHEDULE_X' THEN 'SCHEDULE_X'
        WHEN product.schedule_classification='SCHEDULE_H1' OR product.is_schedule_h1 THEN 'SCHEDULE_H1'
        WHEN product.schedule_classification='SCHEDULE_H' THEN 'SCHEDULE_H'
        WHEN COALESCE(product.schedule_classification,'NONE')='NONE' AND product.prescription_required THEN 'PRESCRIPTION'
        ELSE 'BLOCKED'
      END
  ) THEN
    RAISE EXCEPTION 'RESTRICTED_DISPENSING_BLOCKED: verified prescription and pharmacist workflow required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER phase1_guard_dispensing ON sale_items;
CREATE CONSTRAINT TRIGGER phase1_guard_dispensing AFTER INSERT OR UPDATE ON sale_items
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION phase1_guard_dispensing();
REVOKE EXECUTE ON FUNCTION phase1_guard_dispensing() FROM PUBLIC;
