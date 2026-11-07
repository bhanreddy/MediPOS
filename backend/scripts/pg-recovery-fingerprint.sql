\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL timezone = 'UTC';
CREATE TEMP TABLE recovery_fingerprint (relation text, rows bigint, sha256 text);
DO $$
DECLARE
  relation text;
  row_count bigint;
  fingerprint text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'auth.users', 'public._app_migrations', 'public.stores', 'public.user_store_access',
    'public.medicines', 'public.medicine_batches', 'public.inventory_positions',
    'public.sales', 'public.sale_items', 'public.stock_ledger', 'public.payment_transactions',
    'public.cash_register_sessions', 'public.cash_register_movements', 'public.purchases',
    'public.purchase_items', 'public.supplier_payable_ledger', 'public.stock_transfers',
    'public.transfer_receipts', 'public.offline_command_inbox',
    'public.app_runtime_checkpoints', 'public.app_prescription_documents',
    'public.regulated_dispensing', 'public.sale_return_credit_notes',
    'public.parked_sales', 'public.clinic_tax_document_sequences'
  ] LOOP
    EXECUTE format(
      'SELECT count(*), encode(sha256(convert_to(coalesce(string_agg(hash, %L ORDER BY hash), %L), %L)), %L)
       FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text, %L)), %L) AS hash FROM %s t) rows',
       '', '', 'UTF8', 'hex', 'UTF8', 'hex', relation
    ) INTO row_count, fingerprint;
    INSERT INTO recovery_fingerprint VALUES (relation,row_count,fingerprint);
  END LOOP;
END $$;
COPY (SELECT * FROM recovery_fingerprint ORDER BY relation) TO STDOUT WITH (FORMAT csv, HEADER);
ROLLBACK;
