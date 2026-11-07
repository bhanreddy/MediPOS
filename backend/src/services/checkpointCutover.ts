import { postgresQuery } from '../lib/postgresDb';
/** A preserved image is not proof that its embedded transactions were migrated. */
export async function verifyCheckpointCutover() {
 const unresolved=await postgresQuery(`SELECT checkpoint.name,checkpoint.revision FROM app_runtime_checkpoints checkpoint
  LEFT JOIN runtime_checkpoint_cutovers cutover ON cutover.checkpoint_name=checkpoint.name
  WHERE cutover.checkpoint_name IS NULL OR cutover.checkpoint_revision<>checkpoint.revision
    OR cutover.image_sha256<>encode(sha256(checkpoint.image),'hex')`);
 if(unresolved.length)throw new Error('Legacy SQLite checkpoints require explicit reconciliation before PostgreSQL cutover. Run the checkpoint staging tool and review every record; existing images have been preserved.');
}
