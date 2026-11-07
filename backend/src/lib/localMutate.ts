import { guardTenantMutation } from './tenantContext';
import { cloudBusinessMode } from './businessDb';
import { localMutate as cloudMutate } from './postgresDb';

/** Cloud writes stay in PostgreSQL. Offline records and outbox commit together. */
export async function localMutate(input: { table: string; operation: 'INSERT' | 'UPDATE' | 'DELETE'; data: Record<string, any> }) {
  await guardTenantMutation(input.table, input.data);
  if (cloudBusinessMode()) return cloudMutate(input);
  const { localDb } = await import('../local-db');
  const { mutateOfflineRecord } = await import('./offlineMutate');
  return localDb.transaction(() => mutateOfflineRecord(input))();
}
