-- Promotional balances are derived from an append-only, signed ledger. No editable balance column.
CREATE TABLE IF NOT EXISTS promo_wallet_accounts (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  last_sequence integer NOT NULL DEFAULT 0 CHECK(last_sequence >= 0),
  head_hash text NOT NULL,
  head_mac text NOT NULL,
  UNIQUE(clinic_id, customer_id)
);
CREATE TABLE IF NOT EXISTS promo_wallet_operations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES promo_wallet_accounts(id),
  operation_key text NOT NULL,
  payload_hash text NOT NULL,
  action text NOT NULL CHECK(action IN ('credit','redeem','refund','revoke','expire')),
  UNIQUE(account_id, operation_key)
);
CREATE TABLE IF NOT EXISTS promo_wallet_ledger (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES promo_wallet_accounts(id),
  sequence integer NOT NULL CHECK(sequence > 0),
  kind text NOT NULL CHECK(kind IN ('CREDIT','REDEEM','REFUND','REVOKE','EXPIRE')),
  lot_id uuid NOT NULL,
  amount_paise bigint NOT NULL CHECK(amount_paise <> 0 AND abs(amount_paise) <= 1000000000),
  balance_after_paise bigint NOT NULL CHECK(balance_after_paise >= 0),
  expires_at timestamptz NOT NULL,
  sale_id uuid REFERENCES sales(id),
  operation_id uuid NOT NULL REFERENCES promo_wallet_operations(id),
  actor_id uuid NOT NULL,
  reason varchar(500) NOT NULL,
  created_at timestamptz NOT NULL,
  previous_hash text NOT NULL,
  hash text NOT NULL,
  UNIQUE(account_id, sequence)
);
CREATE INDEX IF NOT EXISTS promo_wallet_ledger_sale ON promo_wallet_ledger(sale_id, account_id);
CREATE INDEX IF NOT EXISTS promo_wallet_ledger_lot ON promo_wallet_ledger(account_id, lot_id);
CREATE OR REPLACE FUNCTION protect_promo_wallet_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Wallet history is append-only; use a recorded reversal' USING ERRCODE='55000';
END $$;
DROP TRIGGER IF EXISTS immutable_promo_wallet_ledger ON promo_wallet_ledger;
CREATE TRIGGER immutable_promo_wallet_ledger BEFORE UPDATE OR DELETE ON promo_wallet_ledger FOR EACH STATEMENT EXECUTE FUNCTION protect_promo_wallet_ledger();
DROP TRIGGER IF EXISTS immutable_promo_wallet_operations ON promo_wallet_operations;
CREATE TRIGGER immutable_promo_wallet_operations BEFORE UPDATE OR DELETE ON promo_wallet_operations FOR EACH STATEMENT EXECUTE FUNCTION protect_promo_wallet_ledger();
DROP TRIGGER IF EXISTS no_truncate_promo_wallet_ledger ON promo_wallet_ledger;
CREATE TRIGGER no_truncate_promo_wallet_ledger BEFORE TRUNCATE ON promo_wallet_ledger FOR EACH STATEMENT EXECUTE FUNCTION protect_promo_wallet_ledger();
DROP TRIGGER IF EXISTS no_truncate_promo_wallet_operations ON promo_wallet_operations;
CREATE TRIGGER no_truncate_promo_wallet_operations BEFORE TRUNCATE ON promo_wallet_operations FOR EACH STATEMENT EXECUTE FUNCTION protect_promo_wallet_ledger();
DROP TRIGGER IF EXISTS no_delete_promo_wallet_accounts ON promo_wallet_accounts;
CREATE TRIGGER no_delete_promo_wallet_accounts BEFORE DELETE OR TRUNCATE ON promo_wallet_accounts FOR EACH STATEMENT EXECUTE FUNCTION protect_promo_wallet_ledger();
ALTER TABLE promo_wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_wallet_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_wallet_ledger ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON promo_wallet_accounts, promo_wallet_operations, promo_wallet_ledger FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON promo_wallet_accounts, promo_wallet_operations, promo_wallet_ledger FROM authenticated;
  END IF;
END $$;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS wallet_redeemed_paise bigint NOT NULL DEFAULT 0 CHECK(wallet_redeemed_paise >= 0);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS wallet_checkout_hash text;
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_mode_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_mode_check CHECK(payment_mode IN ('cash','upi','card','credit','mixed','wallet','prepaid'));
