-- Preserve legacy signed records while adding returned-sale earning baselines.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS nex_coins_expires_at timestamptz;
ALTER TABLE promo_wallet_ledger ADD COLUMN IF NOT EXISTS source_returned_paise bigint;
ALTER TABLE promo_wallet_ledger DROP CONSTRAINT IF EXISTS promo_wallet_ledger_schema_version_check;
ALTER TABLE promo_wallet_ledger ADD CONSTRAINT promo_wallet_ledger_schema_version_check CHECK(schema_version IN (1,2,3));
