import { withPostgresTransaction } from './postgresDb';
/** Compatibility name retained for internal callers. Cloud state lives in SQL
 * tables; archived SQLite checkpoints are migrated explicitly before cutover. */
export async function withDurableRuntime<T>(operation: () => Promise<T>): Promise<T> {
  return withPostgresTransaction(operation);
}
