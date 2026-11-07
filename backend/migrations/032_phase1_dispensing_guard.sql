-- Restricted dispensing stays closed until Phase 3 supplies a verified statutory
-- workflow. Enforce stored classifications at every cloud sale-item write,
-- including old sync endpoints and direct service-role inserts.
CREATE OR REPLACE FUNCTION phase1_guard_dispensing() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE product medicines%ROWTYPE; invoice sales%ROWTYPE;
BEGIN
  SELECT * INTO invoice FROM sales WHERE id=NEW.sale_id;
  SELECT * INTO product FROM medicines WHERE id=NEW.medicine_id FOR SHARE;
  IF NOT FOUND OR product.deleted_at IS NOT NULL OR product.clinic_id IS DISTINCT FROM invoice.clinic_id
    OR NEW.clinic_id IS DISTINCT FROM invoice.clinic_id THEN
    RAISE EXCEPTION 'Sale item medicine and invoice must belong to the same clinic' USING ERRCODE='23514';
  END IF;
  IF NOT COALESCE(invoice.is_return,false) AND
    (COALESCE(product.prescription_required,false) OR COALESCE(product.is_schedule_h1,false)
      OR COALESCE(product.schedule_classification,'NONE') <> 'NONE') THEN
    RAISE EXCEPTION 'RESTRICTED_DISPENSING_BLOCKED: verified prescription and pharmacist workflow required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase1_guard_dispensing ON sale_items;
CREATE TRIGGER phase1_guard_dispensing BEFORE INSERT OR UPDATE ON sale_items FOR EACH ROW EXECUTE FUNCTION phase1_guard_dispensing();
REVOKE EXECUTE ON FUNCTION phase1_guard_dispensing() FROM PUBLIC;
