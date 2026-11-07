-- Phase 1: asynchronous operational services use the existing PostgreSQL tables.
-- Add compatibility metadata without replacing or deleting existing records.
-- Rollback: revert application first; retain additive columns and all ledgers.
CREATE OR REPLACE FUNCTION operational_record_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW._deleted IS DISTINCT FROM OLD._deleted THEN
    NEW.deleted_at := CASE WHEN NEW._deleted::text IN ('1','true','t') THEN COALESCE(NEW.deleted_at, now()) ELSE NULL END;
  ELSE
    NEW := jsonb_populate_record(NEW, jsonb_build_object('_deleted', CASE WHEN pg_typeof(NEW._deleted)::text='boolean' THEN to_jsonb(NEW.deleted_at IS NOT NULL) ELSE to_jsonb(CASE WHEN NEW.deleted_at IS NULL THEN 0 ELSE 1 END) END));
  END IF;
  NEW._updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END $$;

DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT table_name FROM information_schema.columns
  WHERE table_schema='public' AND column_name='id'
    AND table_name NOT LIKE 'promo_%' AND table_name NOT LIKE 'nex_%'
    AND table_name IN (SELECT tablename FROM pg_tables WHERE schemaname='public')
 LOOP
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS _synced integer NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS _deleted integer NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS _updated_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t.table_name);
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t.table_name AND column_name='_deleted' AND data_type='boolean') THEN
    EXECUTE format('UPDATE %I SET _deleted=true WHERE deleted_at IS NOT NULL AND _deleted=false',t.table_name);
  ELSE
    EXECUTE format('UPDATE %I SET _deleted=1 WHERE deleted_at IS NOT NULL AND _deleted=0',t.table_name);
  END IF;
  EXECUTE format('DROP TRIGGER IF EXISTS operational_record_metadata ON %I',t.table_name);
  EXECUTE format('CREATE TRIGGER operational_record_metadata BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION operational_record_metadata()',t.table_name);
 END LOOP;
END $$;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS home_delivery_enabled integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cold_chain_supported integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cold_storage_supported integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_active_orders integer DEFAULT 50;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS payment_terms text DEFAULT 'NET_30';

ALTER TABLE medicines
  ADD COLUMN IF NOT EXISTS purchase_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mrp numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shelf_life_days integer DEFAULT 730,
  ADD COLUMN IF NOT EXISTS minimum_order_quantity integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reorder_level integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS reorder_quantity integer DEFAULT 20,
  ADD COLUMN IF NOT EXISTS units_per_pack integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_stock numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storage_type text;

ALTER TABLE medicine_batches
  ADD COLUMN IF NOT EXISTS mrp_paise integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_recalled boolean DEFAULT false;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'COMPLETED';

ALTER TABLE stock_ledger
  ADD COLUMN IF NOT EXISTS location_type text,
  ADD COLUMN IF NOT EXISTS unit_cost_paise integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_unit numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS created_by text;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES regions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS financial_year_id uuid REFERENCES financial_years(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS expected_delivery_date text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS delivery_location_type text DEFAULT 'STORE',
  ADD COLUMN IF NOT EXISTS delivery_location_id text,
  ADD COLUMN IF NOT EXISTS subtotal_paise integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_paise integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_paise integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_paise integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS terms_and_conditions text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE purchase_returns
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS return_number text,
  ADD COLUMN IF NOT EXISTS grn_id uuid REFERENCES goods_receipts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES purchase_invoices(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS total_value_paise integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_paise integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debit_note_id uuid REFERENCES debit_notes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

-- PostgreSQL upserts need a real unique identifier in legacy enterprise tables.
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT table_name FROM information_schema.columns
  WHERE table_schema='public' AND column_name='_local_id'
    AND table_name IN (SELECT tablename FROM pg_tables WHERE schemaname='public')
 LOOP
  EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (_local_id)', 'phase1_'||t.table_name||'_local_id',t.table_name);
 END LOOP;
END $$;

-- NULL locations must not admit duplicate stock positions. Existing duplicates
-- require reconciliation; aborting this migration is safer than silently merging.
CREATE UNIQUE INDEX IF NOT EXISTS phase1_inventory_position_location
 ON inventory_positions(organization_id,medicine_id,batch_id,location_type,store_id,warehouse_id) NULLS NOT DISTINCT;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='phase1_nonnegative_batch_stock') THEN
 ALTER TABLE medicine_batches ADD CONSTRAINT phase1_nonnegative_batch_stock CHECK(quantity_remaining >= 0) NOT VALID;
END IF; END $$;
