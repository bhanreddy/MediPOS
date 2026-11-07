-- One immutable command identity per tenant. Rejected/conflicting payloads are
-- retained for explicit operator resolution; there is no last-write-wins merge.
CREATE TABLE IF NOT EXISTS offline_command_inbox (
 clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
 command_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 device_id text NOT NULL,
 command_type text NOT NULL CHECK(command_type IN ('SALE','SALE_RETURN')),
 payload jsonb NOT NULL,
 payload_hash text NOT NULL,
 status text NOT NULL CHECK(status IN ('PROCESSING','APPLIED','CONFLICT','REJECTED')),
 result jsonb,
 received_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 PRIMARY KEY(clinic_id,command_id)
);
CREATE INDEX IF NOT EXISTS offline_inbox_actor_status ON offline_command_inbox(clinic_id,actor_id,status,received_at);
ALTER TABLE offline_command_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON offline_command_inbox FROM PUBLIC;
CREATE OR REPLACE FUNCTION protect_offline_inbox_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Offline command history cannot be deleted'; END IF;
 IF OLD.status<>'PROCESSING' OR NEW.payload_hash<>OLD.payload_hash OR NEW.payload<>OLD.payload OR NEW.actor_id<>OLD.actor_id OR NEW.command_type<>OLD.command_type THEN
  RAISE EXCEPTION 'Offline command identity and final results are immutable';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS immutable_offline_command ON offline_command_inbox;
CREATE TRIGGER immutable_offline_command BEFORE UPDATE OR DELETE ON offline_command_inbox FOR EACH ROW EXECUTE FUNCTION protect_offline_inbox_identity();
-- Fill only missing organization links where a clinic already has an established
-- PostgreSQL organization. First-time clinic provisioning handles the remainder.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['medicines','medicine_batches','customers','suppliers','sales','sale_items','purchases','purchase_items','expenses','stock_ledger'] LOOP
  EXECUTE format('UPDATE %I AS item SET organization_id=c.organization_id FROM clinics c WHERE item.clinic_id=c.id AND item.organization_id IS NULL AND c.organization_id IS NOT NULL',t);
 END LOOP;
END $$;
