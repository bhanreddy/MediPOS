-- The original compressed checkpoint remains untouched. A cloud instance must
-- not serve traffic over unmigrated embedded-only transactions.
CREATE TABLE IF NOT EXISTS runtime_checkpoint_migration_rows (
 checkpoint_name text NOT NULL,
 checkpoint_revision bigint NOT NULL,
 table_name text NOT NULL,
 record_key text NOT NULL,
 source_record jsonb NOT NULL,
 disposition text NOT NULL DEFAULT 'PENDING' CHECK(disposition IN ('PENDING','IMPORTED','KEEP_CLOUD','ARCHIVED_METADATA')),
 target_id text,
 reviewed_by text,
 reason text,
 reviewed_at timestamptz,
 PRIMARY KEY(checkpoint_name,checkpoint_revision,table_name,record_key)
);
CREATE TABLE IF NOT EXISTS runtime_checkpoint_cutovers (
 checkpoint_name text PRIMARY KEY REFERENCES app_runtime_checkpoints(name) ON DELETE RESTRICT,
 checkpoint_revision bigint NOT NULL,
 image_sha256 text NOT NULL,
 staged_rows bigint NOT NULL,
 reviewed_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE runtime_checkpoint_migration_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_checkpoint_cutovers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON runtime_checkpoint_migration_rows,runtime_checkpoint_cutovers FROM PUBLIC;
