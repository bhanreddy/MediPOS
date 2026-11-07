-- Purchase documents contain tenant business data. Only the API service role
-- may access them; clients download through the authenticated clinic proxy.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL THEN
    UPDATE storage.buckets SET public = false WHERE id = 'purchase-bills';
    DROP POLICY IF EXISTS purchase_bills_api_only ON storage.objects;
    CREATE POLICY purchase_bills_api_only ON storage.objects AS RESTRICTIVE
      FOR ALL TO PUBLIC
      USING (bucket_id <> 'purchase-bills')
      WITH CHECK (bucket_id <> 'purchase-bills');
  END IF;
END $$;
