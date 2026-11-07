-- Preserve the old cached balance as reconciliation evidence. New settlements
-- derive payable amounts from both canonical invoice tables, never a decrement
-- of a cached supplier balance alone.
CREATE TABLE IF NOT EXISTS supplier_balance_reconciliation (
  supplier_id uuid PRIMARY KEY REFERENCES suppliers(id) ON DELETE RESTRICT,
  clinic_id uuid REFERENCES clinics(id) ON DELETE RESTRICT,
  previous_cached_paise bigint NOT NULL,
  invoice_due_paise bigint NOT NULL,
  legacy_opening_paise bigint NOT NULL DEFAULT 0,
  requires_review boolean NOT NULL DEFAULT false,
  captured_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO supplier_balance_reconciliation(supplier_id,clinic_id,previous_cached_paise,invoice_due_paise,legacy_opening_paise,requires_review)
SELECT s.id,s.clinic_id,round(COALESCE(s.outstanding_balance,0)*100)::bigint,COALESCE(p.due,0)+COALESCE(i.due,0),
 CASE WHEN COALESCE(p.total_count,0)+COALESCE(i.total_count,0)=0 THEN round(COALESCE(s.outstanding_balance,0)*100)::bigint ELSE 0 END,
 COALESCE(p.total_count,0)+COALESCE(i.total_count,0)>0 AND round(COALESCE(s.outstanding_balance,0)*100)::bigint<>COALESCE(p.due,0)+COALESCE(i.due,0)
FROM suppliers s
LEFT JOIN LATERAL (SELECT count(*) AS total_count,COALESCE(sum(round(GREATEST(0,net_amount-COALESCE(paid_amount,0))*100)),0)::bigint AS due
 FROM purchases WHERE supplier_id=s.id AND deleted_at IS NULL) p ON true
LEFT JOIN LATERAL (SELECT count(*) AS total_count,COALESCE(sum(balance_due_paise),0)::bigint AS due
 FROM purchase_invoices WHERE supplier_id=s.id AND status='POSTED' AND deleted_at IS NULL) i ON true
ON CONFLICT(supplier_id) DO NOTHING;
ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES clinics(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS idempotency_key text, ADD COLUMN IF NOT EXISTS request_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS phase1_supplier_payment_request ON supplier_payments(clinic_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE supplier_payment_allocations ALTER COLUMN invoice_id DROP NOT NULL,
 ADD COLUMN IF NOT EXISTS purchase_id uuid REFERENCES purchases(id) ON DELETE RESTRICT;
ALTER TABLE supplier_payable_ledger ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES clinics(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS purchase_id uuid REFERENCES purchases(id) ON DELETE RESTRICT;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='phase1_supplier_allocation_target') THEN
 ALTER TABLE supplier_payment_allocations ADD CONSTRAINT phase1_supplier_allocation_target CHECK(num_nonnulls(invoice_id,purchase_id)=1) NOT VALID;
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS phase1_supplier_payment_ledger ON supplier_payable_ledger(supplier_id,reference_id,transaction_type);
ALTER TABLE supplier_payment_allocations ALTER CONSTRAINT supplier_payment_allocations_payment_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payable_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_balance_reconciliation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON supplier_balance_reconciliation FROM PUBLIC;

-- Correct legacy caches from authoritative invoice liabilities while retaining
-- their previous values and discrepancy flags in the reconciliation evidence.
UPDATE suppliers s SET outstanding_balance=(r.invoice_due_paise+r.legacy_opening_paise)/100.0
FROM supplier_balance_reconciliation r WHERE s.id=r.supplier_id
 AND round(COALESCE(s.outstanding_balance,0)*100)::bigint=r.previous_cached_paise;

-- The clinic remains the authority for older single-store records without an organization link.
ALTER TABLE supplier_payments ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE supplier_payable_ledger ALTER COLUMN organization_id DROP NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='phase1_supplier_payment_tenant') THEN ALTER TABLE supplier_payments ADD CONSTRAINT phase1_supplier_payment_tenant CHECK(num_nonnulls(organization_id,clinic_id)>0); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='phase1_supplier_ledger_tenant') THEN ALTER TABLE supplier_payable_ledger ADD CONSTRAINT phase1_supplier_ledger_tenant CHECK(num_nonnulls(organization_id,clinic_id)>0); END IF;
END $$;
