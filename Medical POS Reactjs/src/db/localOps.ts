/**
 * localOps.ts — Generic local CRUD + sync queue enqueue for the Desktop app (Dexie/IndexedDB).
 *
 * Mirrors the mobile localOps.ts pattern:
 *   1. Write to Dexie immediately (optimistic UI)
 *   2. Enqueue a sync_queue row (for later push to server)
 *
 * All reads come from Dexie — never from the server directly.
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from './index';
import type { SyncQueueItem } from '../core/types';

/* ─── Types ───────────────────────────────────────────── */

export type DexieTableName =
  | 'users' | 'products' | 'batches' | 'inventory'
  | 'customers' | 'suppliers' | 'sales' | 'sale_items'
  | 'purchases' | 'expenses'
  | 'purchase_orders' | 'supplier_ledger_entries'
  | 'purchase_returns' | 'purchase_return_lines';

/* ─── Helpers ─────────────────────────────────────────── */

function now(): string {
  return new Date().toISOString();
}

/** Get a Dexie table reference by name. */
function getTable(name: DexieTableName) {
  return (db as any)[name];
}

/* ─── ENQUEUE ─────────────────────────────────────────── */

async function enqueue(
  tableName: string,
  recordId: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: Record<string, unknown>,
): Promise<void> {
  const item: SyncQueueItem = {
    id: uuidv4(),
    table_name: tableName,
    record_id: recordId,
    operation,
    payload: JSON.stringify(payload),
    retry_count: 0,
    created_at: now(),
    status: 'pending',
  };
  await db.sync_queue.add(item);
}

/* ─── INSERT ──────────────────────────────────────────── */

/**
 * Insert a new record into a local Dexie table and enqueue for sync.
 */
export async function localInsert(
  table: DexieTableName,
  data: Record<string, unknown>,
): Promise<string> {
  const localId = uuidv4();
  const timestamp = now();

  const row: Record<string, unknown> = {
    ...data,
    id: localId,           // Dexie uses `id` as primary key
    _local_id: localId,
    _synced: 0,
    _deleted: 0,
    _updated_at: timestamp,
    last_modified: Date.now(),
    created_at: data.created_at || timestamp,
    updated_at: timestamp,
  };

  await getTable(table).add(row);
  await enqueue(table, localId, 'INSERT', row);

  return localId;
}

/* ─── UPDATE ──────────────────────────────────────────── */

/**
 * Update an existing local record by `id` (which equals _local_id) and enqueue for sync.
 */
export async function localUpdate(
  table: DexieTableName,
  recordId: string,
  changes: Record<string, unknown>,
): Promise<void> {
  const timestamp = now();

  const mergedChanges: Record<string, unknown> = {
    ...changes,
    _synced: 0,
    _updated_at: timestamp,
    updated_at: timestamp,
    last_modified: Date.now(),
  };

  await getTable(table).update(recordId, mergedChanges);

  // Read the full updated record for the sync payload
  const fullRow = await getTable(table).get(recordId);
  if (fullRow) {
    await enqueue(table, recordId, 'UPDATE', fullRow);
  }
}

/* ─── SOFT DELETE ─────────────────────────────────────── */

/**
 * Soft-delete a record (_deleted = 1) and enqueue for sync.
 * NEVER hard-deletes — medical compliance requirement.
 */
export async function localDelete(
  table: DexieTableName,
  recordId: string,
): Promise<void> {
  const timestamp = now();

  await getTable(table).update(recordId, {
    _deleted: 1,
    _synced: 0,
    _updated_at: timestamp,
    updated_at: timestamp,
    last_modified: Date.now(),
  });

  const fullRow = await getTable(table).get(recordId);
  if (fullRow) {
    await enqueue(table, recordId, 'DELETE', fullRow);
  }
}

/* ─── READS ───────────────────────────────────────────── */

/**
 * Query all non-deleted records from a local Dexie table.
 */
export async function localQueryAll<T = Record<string, unknown>>(
  table: DexieTableName,
): Promise<T[]> {
  return getTable(table)
    .where('_deleted')
    .equals(0)
    .toArray();
}

/**
 * Get a single record by id.
 */
export async function localGetById<T = Record<string, unknown>>(
  table: DexieTableName,
  recordId: string,
): Promise<T | undefined> {
  const record = await getTable(table).get(recordId);
  if (record && record._deleted === 0) return record;
  return undefined;
}

/**
 * Search records with a filter function.
 */
export async function localFilter<T = Record<string, unknown>>(
  table: DexieTableName,
  filterFn: (record: T) => boolean,
): Promise<T[]> {
  return getTable(table)
    .filter((record: any) => record._deleted === 0 && filterFn(record))
    .toArray();
}

/* ─── SYNC HELPERS ────────────────────────────────────── */

/**
 * Get the count of pending sync items.
 */
export async function getPendingSyncCount(): Promise<number> {
  return db.sync_queue
    .where('status')
    .anyOf('pending', 'failed')
    .count();
}

/**
 * Get or set sync metadata (e.g., last_pulled_at).
 */
export async function getSyncMeta(key: string): Promise<string | null> {
  const meta = await db.sync_meta.get(key);
  return meta?.value ?? null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  await db.sync_meta.put({ key, value });
}
