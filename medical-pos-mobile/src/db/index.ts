/**
 * db/index.ts — Barrel export for the local database layer.
 *
 * Usage in app startup:
 *   import { initLocalDatabase } from '@/db';
 *   initLocalDatabase();
 */
export { getLocalDb, closeLocalDb } from './localDb';
export { initLocalDatabase, SYNCABLE_TABLES } from './initDb';
export type { SyncableTable } from './initDb';
export {
  // CRUD
  localInsert,
  localUpdate,
  localDelete,
  localQueryAll,
  localGetById,
  localGetByServerId,
  localSearch,
  localRawQuery,
  localRawGetFirst,
  // Sync helpers
  generateLocalId,
  getPendingSyncItems,
  markSyncItemsDone,
  markSyncItemFailed,
  markRecordsSynced,
  getPendingSyncCount,
  getSyncMeta,
  setSyncMeta,
  upsertFromServer,
} from './localOps';
export type { LocalRecord, SyncQueueRow } from './localOps';
