-- ==========================================
-- PHASE 1: MULTITENANT DATABASE SCHEMA
-- ==========================================

-- BLOCK 1 — ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";      -- for scheduled alerts later

-- BLOCK 2 — CORE TENANCY TABLES
-- CLINICS (Tenants)
CREATE TABLE clinics (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  slug                  text UNIQUE NOT NULL,
  address               text,
  phone                 text,
  email                 text,
  gstin                 text,
  drug_licence_number   text,
  logo_url              text,
  signature_url         text,
  invoice_footer        text DEFAULT 'Valid prescription required for Schedule H/H1 drugs.',
  plan                  text NOT NULL DEFAULT 'trial',   -- trial | basic | pro | custom
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- USERS (linked to Supabase auth.users)
CREATE TABLE users (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id   uuid REFERENCES clinics(id) ON DELETE RESTRICT,
  full_name   text NOT NULL,
  phone       text,
  role        text NOT NULL CHECK (role IN ('SUPER_ADMIN', 'OWNER', 'PHARMACIST', 'CASHIER', 'VIEWER')),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- BLOCK 3 — SUPPLIER & CUSTOMER TABLES
-- SUPPLIERS (Distributors / Vendors)
CREATE TABLE suppliers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  name                  text NOT NULL,
  phone                 text,
  email                 text,
  gstin                 text,
  drug_licence_number   text,
  address               text,
  outstanding_balance   numeric NOT NULL DEFAULT 0,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- CUSTOMERS (Patients / Walk-ins)
CREATE TABLE customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  phone               text,
  email               text,
  doctor_name         text,
  address             text,
  outstanding_balance numeric NOT NULL DEFAULT 0,
  total_purchases     numeric NOT NULL DEFAULT 0,
  importance_score    integer NOT NULL DEFAULT 0,
  last_purchase_date  date,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- BLOCK 4 — INVENTORY TABLES
-- MEDICINES (Product Master)
CREATE TABLE medicines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  name                  text NOT NULL,
  generic_name          text,
  manufacturer          text,
  category              text DEFAULT 'tablet',
                          -- tablet | syrup | injection | capsule | cream | drops | other
  hsn_code              text,
  gst_rate              numeric NOT NULL DEFAULT 0
                          CHECK (gst_rate IN (0, 5, 12, 18)),
  unit                  text NOT NULL DEFAULT 'strip',
  is_schedule_h1        boolean NOT NULL DEFAULT false,
  low_stock_threshold   integer NOT NULL DEFAULT 10,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- MEDICINE BATCHES (Per-batch stock with expiry)
CREATE TABLE medicine_batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  medicine_id         uuid NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  supplier_id         uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_id         uuid,                              -- FK added after purchases table
  batch_number        text NOT NULL,
  expiry_date         date NOT NULL,
  mrp                 numeric NOT NULL CHECK (mrp > 0),
  purchase_price      numeric NOT NULL CHECK (purchase_price > 0),
  quantity_in         integer NOT NULL CHECK (quantity_in > 0),
  quantity_remaining  integer NOT NULL CHECK (quantity_remaining >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, medicine_id, batch_number)
);

-- BLOCK 5 — PURCHASE TABLES
-- PURCHASES (Purchase Orders / Inward Bills)
CREATE TABLE purchases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  supplier_id      uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  invoice_number   text,
  invoice_date     date,
  bill_image_url   text,                   -- Supabase Storage URL of scanned bill
  subtotal         numeric NOT NULL DEFAULT 0,
  discount         numeric NOT NULL DEFAULT 0,
  gst_amount       numeric NOT NULL DEFAULT 0,
  net_amount       numeric NOT NULL DEFAULT 0,
  payment_status   text NOT NULL DEFAULT 'unpaid'
                     CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  paid_amount      numeric NOT NULL DEFAULT 0,
  notes            text,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- PURCHASE ITEMS (Line items)
CREATE TABLE purchase_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  purchase_id     uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  medicine_id     uuid NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  batch_id        uuid REFERENCES medicine_batches(id) ON DELETE SET NULL,
  batch_number    text NOT NULL,
  expiry_date     date NOT NULL,
  quantity        integer NOT NULL CHECK (quantity > 0),
  purchase_price  numeric NOT NULL CHECK (purchase_price > 0),
  mrp             numeric NOT NULL CHECK (mrp > 0),
  gst_rate        numeric NOT NULL DEFAULT 0,
  discount        numeric NOT NULL DEFAULT 0,
  total           numeric NOT NULL DEFAULT 0
);

-- Add FK from medicine_batches to purchases (circular — added after both tables exist)
ALTER TABLE medicine_batches
  ADD CONSTRAINT medicine_batches_purchase_id_fkey
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL;

-- BLOCK 6 — SALES TABLES
-- SALES (Billing / Invoice Header)
CREATE TABLE sales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  invoice_number  text NOT NULL,
  sale_date       timestamptz NOT NULL DEFAULT now(),
  subtotal        numeric NOT NULL DEFAULT 0,
  discount        numeric NOT NULL DEFAULT 0,
  gst_amount      numeric NOT NULL DEFAULT 0,
  net_amount      numeric NOT NULL DEFAULT 0,
  payment_mode    text NOT NULL DEFAULT 'cash'
                    CHECK (payment_mode IN ('cash', 'upi', 'card', 'credit')),
  payment_status  text NOT NULL DEFAULT 'paid'
                    CHECK (payment_status IN ('paid', 'partial', 'credit')),
  paid_amount     numeric NOT NULL DEFAULT 0,
  balance_due     numeric NOT NULL DEFAULT 0,
  served_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  is_return       boolean NOT NULL DEFAULT false,
  return_of       uuid REFERENCES sales(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, invoice_number)
);

-- SALE ITEMS (Line items)
CREATE TABLE sale_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  sale_id       uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  medicine_id   uuid NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  batch_id      uuid NOT NULL REFERENCES medicine_batches(id) ON DELETE RESTRICT,
  quantity      integer NOT NULL CHECK (quantity > 0),
  mrp           numeric NOT NULL CHECK (mrp > 0),
  discount_pct  numeric NOT NULL DEFAULT 0,
  gst_rate      numeric NOT NULL DEFAULT 0,
  total         numeric NOT NULL DEFAULT 0
);

-- BLOCK 7 — EXPENSES TABLE
CREATE TABLE expenses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  category      text NOT NULL
                  CHECK (category IN ('rent', 'salary', 'utilities', 'supplies', 'maintenance', 'misc')),
  description   text,
  amount        numeric NOT NULL CHECK (amount > 0),
  expense_date  date NOT NULL,
  payment_mode  text NOT NULL DEFAULT 'cash'
                  CHECK (payment_mode IN ('cash', 'upi', 'card', 'bank_transfer')),
  recorded_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- BLOCK 8 — SHORTBOOK & REFILL REMINDERS
-- SHORTBOOK (Auto / Manual Reorder List)
CREATE TABLE shortbook (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  medicine_id           uuid NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  reason                text NOT NULL
                          CHECK (reason IN ('low_stock', 'expired', 'manual')),
  quantity_needed       integer,
  preferred_supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  is_ordered            boolean NOT NULL DEFAULT false,
  ordered_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, medicine_id, is_ordered)   -- prevent duplicate open entries
);

-- REFILL REMINDERS
CREATE TABLE refill_reminders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  medicine_id  uuid NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  remind_on    date NOT NULL,
  is_sent      boolean NOT NULL DEFAULT false,
  sent_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- BLOCK 9 — AUDIT LOG
CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,       -- CREATE | UPDATE | DELETE
  table_name  text NOT NULL,
  record_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- BLOCK 10 — COMPUTED VIEWS
-- Current stock per medicine (non-expired batches only)
CREATE VIEW medicine_stock AS
SELECT
  b.medicine_id,
  b.clinic_id,
  SUM(b.quantity_remaining)   AS total_stock,
  MIN(b.expiry_date)          AS nearest_expiry,
  COUNT(b.id)                 AS batch_count
FROM medicine_batches b
WHERE b.expiry_date > CURRENT_DATE
  AND b.quantity_remaining > 0
GROUP BY b.medicine_id, b.clinic_id;

-- Low stock alert view
CREATE VIEW low_stock_alerts AS
SELECT
  ms.medicine_id,
  ms.clinic_id,
  ms.total_stock,
  m.name                   AS medicine_name,
  m.low_stock_threshold,
  ms.nearest_expiry
FROM medicine_stock ms
JOIN medicines m ON m.id = ms.medicine_id
WHERE ms.total_stock <= m.low_stock_threshold
  AND m.is_active = true;

-- Expiry alert view (batches expiring within 90 days with remaining stock)
CREATE VIEW expiry_alerts AS
SELECT
  b.id             AS batch_id,
  b.clinic_id,
  b.medicine_id,
  m.name           AS medicine_name,
  b.batch_number,
  b.expiry_date,
  b.quantity_remaining,
  b.mrp,
  CASE
    WHEN b.expiry_date <= CURRENT_DATE + INTERVAL '30 days'  THEN 'critical'
    WHEN b.expiry_date <= CURRENT_DATE + INTERVAL '60 days'  THEN 'warning'
    ELSE 'watch'
  END              AS severity
FROM medicine_batches b
JOIN medicines m ON m.id = b.medicine_id
WHERE b.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
  AND b.quantity_remaining > 0
  AND m.is_active = true
ORDER BY b.expiry_date ASC;

-- BLOCK 11 — INDEXES (Performance)
-- Tenant isolation queries
CREATE INDEX idx_medicines_clinic        ON medicines(clinic_id);
CREATE INDEX idx_medicine_batches_clinic ON medicine_batches(clinic_id);
CREATE INDEX idx_medicine_batches_expiry ON medicine_batches(expiry_date, clinic_id);
CREATE INDEX idx_medicine_batches_fifo   ON medicine_batches(medicine_id, expiry_date ASC);
CREATE INDEX idx_sales_clinic_date       ON sales(clinic_id, sale_date DESC);
CREATE INDEX idx_sale_items_clinic       ON sale_items(clinic_id);
CREATE INDEX idx_purchases_clinic_date   ON purchases(clinic_id, created_at DESC);
CREATE INDEX idx_customers_clinic        ON customers(clinic_id);
CREATE INDEX idx_customers_phone         ON customers(clinic_id, phone);
CREATE INDEX idx_suppliers_clinic        ON suppliers(clinic_id);
CREATE INDEX idx_expenses_clinic_date    ON expenses(clinic_id, expense_date DESC);
CREATE INDEX idx_shortbook_clinic        ON shortbook(clinic_id, is_ordered);
CREATE INDEX idx_audit_logs_clinic       ON audit_logs(clinic_id, created_at DESC);

-- Medicine search (full text)
CREATE INDEX idx_medicines_name_search
  ON medicines USING gin(to_tsvector('english', name || ' ' || COALESCE(generic_name, '')));


-- BLOCK 12 — ROW LEVEL SECURITY (RLS)
-- Enable RLS on all tables
ALTER TABLE clinics             ENABLE ROW LEVEL SECURITY;
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicines           ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicine_batches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases           ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE shortbook           ENABLE ROW LEVEL SECURITY;
ALTER TABLE refill_reminders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;

-- Helper function: get clinic_id of the requesting user
CREATE OR REPLACE FUNCTION get_user_clinic_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT clinic_id FROM users WHERE id = auth.uid()
$$;

-- RLS POLICY TEMPLATE (apply to each business table)

-- SUPPLIERS
CREATE POLICY "suppliers_tenant_select" ON suppliers FOR SELECT USING (clinic_id = get_user_clinic_id());
CREATE POLICY "suppliers_tenant_insert" ON suppliers FOR INSERT WITH CHECK (clinic_id = get_user_clinic_id());
CREATE POLICY "suppliers_tenant_update" ON suppliers FOR UPDATE USING (clinic_id = get_user_clinic_id());
CREATE POLICY "suppliers_tenant_delete" ON suppliers FOR DELETE USING (clinic_id = get_user_clinic_id());

-- CUSTOMERS
CREATE POLICY "customers_tenant_select" ON customers FOR SELECT USING (clinic_id = get_user_clinic_id());
CREATE POLICY "customers_tenant_insert" ON customers FOR INSERT WITH CHECK (clinic_id = get_user_clinic_id());
CREATE POLICY "customers_tenant_update" ON customers FOR UPDATE USING (clinic_id = get_user_clinic_id());
CREATE POLICY "customers_tenant_delete" ON customers FOR DELETE USING (clinic_id = get_user_clinic_id());

-- MEDICINES
CREATE POLICY "medicines_tenant_select" ON medicines FOR SELECT USING (clinic_id = get_user_clinic_id());
CREATE POLICY "medicines_tenant_insert" ON medicines FOR INSERT WITH CHECK (clinic_id = get_user_clinic_id());
CREATE POLICY "medicines_tenant_update" ON medicines FOR UPDATE USING (clinic_id = get_user_clinic_id());
CREATE POLICY "medicines_tenant_delete" ON medicines FOR DELETE USING (clinic_id = get_user_clinic_id());

-- MEDICINE BATCHES
CREATE POLICY "batches_tenant_select" ON medicine_batches FOR SELECT USING (clinic_id = get_user_clinic_id());
CREATE POLICY "batches_tenant_insert" ON medicine_batches FOR INSERT WITH CHECK (clinic_id = get_user_clinic_id());
CREATE POLICY "batches_tenant_update" ON medicine_batches FOR UPDATE USING (clinic_id = get_user_clinic_id());
CREATE POLICY "batches_tenant_delete" ON medicine_batches FOR DELETE USING (clinic_id = get_user_clinic_id());

-- PURCHASES
CREATE POLICY "purchases_tenant_select" ON purchases FOR SELECT USING (clinic_id = get_user_clinic_id());
CREATE POLICY "purchases_tenant_insert" ON purchases FOR INSERT WITH CHECK (clinic_id = get_user_clinic_id());
CREATE POLICY "purchases_tenant_update" ON purchases FOR UPDATE USING (clinic_id = get_user_clinic_id());
CREATE POLICY "purchases_tenant_delete" ON purchases FOR DELETE USING (clinic_id = get_user_clinic_id());

-- PURCHASE ITEMS
CREATE POLICY "purchase_items_tenant_select" ON purchase_items FOR SELECT USING (clinic_id = get_user_clinic_id());
CREATE POLICY "purchase_items_tenant_insert" ON purchase_items FOR INSERT WITH CHECK (clinic_id = get_user_clinic_id());
CREATE POLICY "purchase_items_tenant_update" ON purchase_items FOR UPDATE USING (clinic_id = get_user_clinic_id());
CREATE POLICY "purchase_items_tenant_delete" ON purchase_items FOR DELETE USING (clinic_id = get_user_clinic_id());

-- SALES
CREATE POLICY "sales_tenant_select" ON sales FOR SELECT USING (clinic_id = get_user_clinic_id());
CREATE POLICY "sales_tenant_insert" ON sales FOR INSERT WITH CHECK (clinic_id = get_user_clinic_id());
CREATE POLICY "sales_tenant_update" ON sales FOR UPDATE USING (clinic_id = get_user_clinic_id());
CREATE POLICY "sales_tenant_delete" ON sales FOR DELETE USING (clinic_id = get_user_clinic_id());

-- SALE ITEMS
CREATE POLICY "sale_items_tenant_select" ON sale_items FOR SELECT USING (clinic_id = get_user_clinic_id());
CREATE POLICY "sale_items_tenant_insert" ON sale_items FOR INSERT WITH CHECK (clinic_id = get_user_clinic_id());
CREATE POLICY "sale_items_tenant_update" ON sale_items FOR UPDATE USING (clinic_id = get_user_clinic_id());
CREATE POLICY "sale_items_tenant_delete" ON sale_items FOR DELETE USING (clinic_id = get_user_clinic_id());

-- EXPENSES
CREATE POLICY "expenses_tenant_select" ON expenses FOR SELECT USING (clinic_id = get_user_clinic_id());
CREATE POLICY "expenses_tenant_insert" ON expenses FOR INSERT WITH CHECK (clinic_id = get_user_clinic_id());
CREATE POLICY "expenses_tenant_update" ON expenses FOR UPDATE USING (clinic_id = get_user_clinic_id());
CREATE POLICY "expenses_tenant_delete" ON expenses FOR DELETE USING (clinic_id = get_user_clinic_id());

-- SHORTBOOK
CREATE POLICY "shortbook_tenant_select" ON shortbook FOR SELECT USING (clinic_id = get_user_clinic_id());
CREATE POLICY "shortbook_tenant_insert" ON shortbook FOR INSERT WITH CHECK (clinic_id = get_user_clinic_id());
CREATE POLICY "shortbook_tenant_update" ON shortbook FOR UPDATE USING (clinic_id = get_user_clinic_id());
CREATE POLICY "shortbook_tenant_delete" ON shortbook FOR DELETE USING (clinic_id = get_user_clinic_id());

-- REFILL REMINDERS
CREATE POLICY "reminders_tenant_select" ON refill_reminders FOR SELECT USING (clinic_id = get_user_clinic_id());
CREATE POLICY "reminders_tenant_insert" ON refill_reminders FOR INSERT WITH CHECK (clinic_id = get_user_clinic_id());
CREATE POLICY "reminders_tenant_update" ON refill_reminders FOR UPDATE USING (clinic_id = get_user_clinic_id());
CREATE POLICY "reminders_tenant_delete" ON refill_reminders FOR DELETE USING (clinic_id = get_user_clinic_id());

-- AUDIT LOGS (insert-only for all, no delete/update by users)
CREATE POLICY "audit_tenant_select" ON audit_logs FOR SELECT USING (clinic_id = get_user_clinic_id());
CREATE POLICY "audit_tenant_insert" ON audit_logs FOR INSERT WITH CHECK (clinic_id = get_user_clinic_id());

-- CLINICS (users can only read their own clinic)
CREATE POLICY "clinics_tenant_select" ON clinics FOR SELECT USING (id = get_user_clinic_id());
CREATE POLICY "clinics_tenant_update" ON clinics FOR UPDATE USING (id = get_user_clinic_id());

-- USERS (users can only read their own row; OWNER can read all in clinic)
CREATE POLICY "users_self_select" ON users FOR SELECT
  USING (
    id = auth.uid()
    OR (clinic_id = get_user_clinic_id()
        AND EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = auth.uid() AND u.role = 'OWNER'
        ))
  );

-- BLOCK 13 — SUPABASE STORAGE BUCKET
-- Run this in Supabase SQL Editor or via the Storage UI (You may need to run this separately as it includes storage.buckets inserts)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('purchase-bills', 'purchase-bills', false);

-- CREATE POLICY "bill_images_upload" ON storage.objects
--   FOR INSERT WITH CHECK (
--     bucket_id = 'purchase-bills'
--     AND (storage.foldername(name))[1] = get_user_clinic_id()::text
--   );

-- CREATE POLICY "bill_images_select" ON storage.objects
--   FOR SELECT USING (
--     bucket_id = 'purchase-bills'
--     AND (storage.foldername(name))[1] = get_user_clinic_id()::text
--   );

-- BLOCK 14 — DEVICE TOKENS FOR PUSH NOTIFICATIONS
CREATE TABLE device_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  platform        text NOT NULL CHECK (platform IN ('ios', 'android')),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, expo_push_token)
);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_tokens_owner" ON device_tokens
  FOR ALL USING (user_id = auth.uid());

-- ==========================================
-- PHASE 6: SUBSCRIPTION BILLING (PhonePe PG + legacy plan columns)
-- ==========================================

CREATE TABLE subscription_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,      -- trial | basic | pro | custom
  display_name text NOT NULL,
  price_monthly  numeric NOT NULL DEFAULT 0,
  price_annual   numeric NOT NULL DEFAULT 0,
  razorpay_plan_id_monthly text,         -- legacy; unused with PhonePe checkout
  razorpay_plan_id_annual  text,
  features    jsonb NOT NULL DEFAULT '{}',
  limits      jsonb NOT NULL DEFAULT '{}',  -- { max_users: 2, max_daily_bills: 25 }
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clinic_subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id               uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  plan_name               text NOT NULL,
  razorpay_subscription_id text UNIQUE,
  razorpay_customer_id    text,
  payment_merchant_order_id text UNIQUE,
  payment_provider_order_id text,
  status                  text NOT NULL DEFAULT 'created'
                            CHECK (status IN ('created','authenticated','active','paused','cancelled','expired','trial','pending')),
  billing_cycle           text NOT NULL DEFAULT 'monthly'
                            CHECK (billing_cycle IN ('monthly', 'annual')),
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  trial_end               timestamptz,
  cancelled_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscription_invoices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid NOT NULL REFERENCES clinics(id),
  subscription_id       uuid REFERENCES clinic_subscriptions(id),
  razorpay_invoice_id   text,            -- stores PhonePe merchant order id for new rows
  razorpay_payment_id   text,            -- stores PhonePe transaction id for new rows
  amount                numeric NOT NULL,
  status                text NOT NULL DEFAULT 'pending',
  paid_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Seed plan definitions:
INSERT INTO subscription_plans (name, display_name, price_monthly, price_annual, limits) VALUES
  ('trial',  'Free Trial',  0,   0,    '{"max_users": 1, "max_daily_bills": 25, "trial_days": 14}'),
  ('basic',  'Basic',       499, 4999, '{"max_users": 2, "max_daily_bills": 100}'),
  ('pro',    'Pro',         999, 9999, '{"max_users": 10, "max_daily_bills": 9999}'),
  ('custom', 'Custom',      0,   0,    '{"max_users": 9999, "max_daily_bills": 9999}');

-- RLS: clinics can read their own subscription
ALTER TABLE clinic_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sub_read_own" ON clinic_subscriptions
  FOR SELECT USING (clinic_id = get_user_clinic_id());

CREATE POLICY "sub_invoice_read_own" ON subscription_invoices
  FOR SELECT USING (clinic_id = get_user_clinic_id());

CREATE POLICY "plans_public_read" ON subscription_plans
  FOR SELECT USING (true);

