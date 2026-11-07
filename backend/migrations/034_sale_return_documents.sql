ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS restock_decision text CHECK(restock_decision IN ('RESTOCK','DO_NOT_RESTOCK'));
CREATE TABLE IF NOT EXISTS sale_return_credit_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 _local_id text UNIQUE,
 updated_at timestamptz NOT NULL DEFAULT now(),
 clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
 original_sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
 return_sale_id uuid NOT NULL UNIQUE REFERENCES sales(id) ON DELETE RESTRICT,
 credit_note_number text NOT NULL,
 refund_method text NOT NULL CHECK(refund_method IN ('cash','upi','card','original')),
 total_refund_paise bigint NOT NULL CHECK(total_refund_paise>=0),
 credit_reduction_paise bigint NOT NULL CHECK(credit_reduction_paise>=0),
 wallet_refund_paise bigint NOT NULL CHECK(wallet_refund_paise>=0),
 external_refund_paise bigint NOT NULL CHECK(external_refund_paise>=0),
 performed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 approved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(clinic_id,credit_note_number),
 CHECK(total_refund_paise=credit_reduction_paise+wallet_refund_paise+external_refund_paise)
);
CREATE OR REPLACE FUNCTION reject_phase1_financial_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Financial records are append-only'; END $$;
DROP TRIGGER IF EXISTS immutable_credit_note ON sale_return_credit_notes;
CREATE TRIGGER immutable_credit_note BEFORE UPDATE OR DELETE ON sale_return_credit_notes FOR EACH ROW EXECUTE FUNCTION reject_phase1_financial_change();
ALTER TABLE sale_return_credit_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sale_return_credit_notes FROM PUBLIC;
