-- Versioned, owner-controlled earning rules. Existing awards retain their original deadlines.
CREATE TABLE IF NOT EXISTS nex_coin_policies (
 id uuid PRIMARY KEY,
 clinic_id uuid NOT NULL REFERENCES clinics(id),
 version integer NOT NULL CHECK(version>0),
 enabled boolean NOT NULL,
 rate_bps integer NOT NULL CHECK(rate_bps BETWEEN 500 AND 1000),
 minimum_sale_paise bigint NOT NULL CHECK(minimum_sale_paise BETWEEN 0 AND 1000000000),
 earning_cap_paise bigint NOT NULL CHECK(earning_cap_paise BETWEEN 0 AND 1000000000),
 redemption_limit_percent integer NOT NULL CHECK(redemption_limit_percent BETWEEN 0 AND 100),
 expiry_days integer NOT NULL CHECK(expiry_days BETWEEN 1 AND 365),
 actor_id uuid NOT NULL,
 reason varchar(500) NOT NULL,
 created_at timestamptz NOT NULL,
 previous_hash text NOT NULL,
 hash text NOT NULL,
 UNIQUE(clinic_id,version)
);
ALTER TABLE nex_coin_policies ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS immutable_nex_coin_policies ON nex_coin_policies;
CREATE TRIGGER immutable_nex_coin_policies BEFORE UPDATE OR DELETE OR TRUNCATE ON nex_coin_policies FOR EACH STATEMENT EXECUTE FUNCTION protect_promo_wallet_ledger();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON nex_coin_policies FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON nex_coin_policies FROM authenticated; END IF;
END $$;
ALTER TABLE promo_wallet_ledger DROP CONSTRAINT IF EXISTS promo_wallet_ledger_kind_check;
ALTER TABLE promo_wallet_ledger ADD CONSTRAINT promo_wallet_ledger_kind_check CHECK(kind IN ('CREDIT','EARN','REDEEM','REFUND','REVOKE','EXPIRE','CLAWBACK'));
ALTER TABLE promo_wallet_ledger ADD COLUMN IF NOT EXISTS schema_version smallint NOT NULL DEFAULT 1 CHECK(schema_version IN (1,2));
ALTER TABLE promo_wallet_ledger ADD COLUMN IF NOT EXISTS source_sale_total_paise bigint;
ALTER TABLE promo_wallet_ledger ADD COLUMN IF NOT EXISTS source_external_paise bigint;
ALTER TABLE promo_wallet_ledger ADD COLUMN IF NOT EXISTS policy_version integer;
ALTER TABLE promo_wallet_ledger ADD COLUMN IF NOT EXISTS debt_offset_paise bigint NOT NULL DEFAULT 0 CHECK(debt_offset_paise>=0);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS nex_coins_earned_paise bigint NOT NULL DEFAULT 0 CHECK(nex_coins_earned_paise>=0);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS nex_coins_expires_at timestamptz;

ALTER TABLE promo_wallet_ledger ADD COLUMN IF NOT EXISTS source_returned_paise bigint;
