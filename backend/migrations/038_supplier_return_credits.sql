ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_credit_paise bigint NOT NULL DEFAULT 0 CHECK(supplier_credit_paise>=0);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS supplier_credit_paise bigint NOT NULL DEFAULT 0 CHECK(supplier_credit_paise>=0);
CREATE TABLE IF NOT EXISTS supplier_return_credits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
 supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
 purchase_return_id uuid NOT NULL UNIQUE REFERENCES purchase_returns(id) ON DELETE RESTRICT,
 amount_paise bigint NOT NULL CHECK(amount_paise>0), unallocated_paise bigint NOT NULL CHECK(unallocated_paise>=0 AND unallocated_paise<=amount_paise),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS supplier_return_credit_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), credit_id uuid NOT NULL REFERENCES supplier_return_credits(id) ON DELETE RESTRICT,
 purchase_id uuid REFERENCES purchases(id) ON DELETE RESTRICT, invoice_id uuid REFERENCES purchase_invoices(id) ON DELETE RESTRICT,
 amount_paise bigint NOT NULL CHECK(amount_paise>0), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(purchase_id,invoice_id)=1)
);
ALTER TABLE supplier_return_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_return_credit_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON supplier_return_credits,supplier_return_credit_allocations FROM PUBLIC;
-- Old returns reduced only the supplier cache. Preserve their recorded value
-- as an unallocated credit; allocate it to invoices under the supplier lock.
INSERT INTO supplier_return_credits(clinic_id,supplier_id,purchase_return_id,amount_paise,unallocated_paise,created_at)
SELECT clinic_id,supplier_id,id,round(total_value*100)::bigint,round(total_value*100)::bigint,created_at
FROM purchase_returns WHERE clinic_id IS NOT NULL AND supplier_id IS NOT NULL AND total_value>0 AND deleted_at IS NULL AND status='POSTED'
ON CONFLICT(purchase_return_id) DO NOTHING;
