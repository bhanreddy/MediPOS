/**
 * syncEngine.ts — Push + Pull sync engine for the Tauri desktop app.
 *
 * Uses Dexie (IndexedDB) as the local store.
 * RULE: Always PUSH before PULL.
 */
import { db } from '../db/index';
import type { SyncQueueItem } from '../core/types';
import axios from 'axios';
import { supabase } from '../lib/supabase';
import { HydrationService } from '../state/hydration';
import { queryClient } from '../lib/queryClient';

/* ─── Config ──────────────────────────────────────────── */

// Use the same API base URL as the rest of the desktop app
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

/** Get the auth token from the live Supabase session. */
async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch {
    // noop
  }
  return null;
}

/** Create an authenticated axios instance for sync requests. */
async function createSyncClient() {
  const token = await getAuthToken();
  console.log('[SyncEngine Desktop] Auth token:', token ? `present (${token.substring(0, 20)}...)` : 'MISSING — requests will be unauthenticated!');
  return axios.create({
    baseURL: API_BASE,
    timeout: 30_000,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

/* ─── Types ───────────────────────────────────────────── */

interface PushBatchOperation {
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown>;
  queue_id: string;
}

interface PushBatch {
  table: string;
  operations: PushBatchOperation[];
}

interface PushResponse {
  success: boolean;
  processed: number;
  results: Array<{
    table: string;
    queue_id: string;
    status: 'ok' | 'error';
    error?: string;
    server_id?: string;
  }>;
}

interface PullResponse {
  tables: Record<string, Array<Record<string, unknown>>>;
  server_time: string;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  errors: number;
  skipped: number;
}

/* ─── Syncable Tables ─────────────────────────────────── */

const SYNCABLE_TABLES = [
  'suppliers', 'customers', 'products', 'batches',
  'purchases', 'sales', 'sale_items', 'expenses',
] as const;

// Map desktop table names → server table names (where they differ)
const TABLE_NAME_MAP: Record<string, string> = {
  products: 'medicines',
  batches: 'medicine_batches',
};

function toServerTable(localTable: string): string {
  return TABLE_NAME_MAP[localTable] || localTable;
}

/* ─── PUSH: Local → Server ────────────────────────────── */

export async function pushQueue(): Promise<{ pushed: number; errors: number }> {
  const pending = await db.sync_queue
    .where('status')
    .anyOf('pending', 'failed')
    .toArray();

  console.log(`[SyncEngine Desktop] Push: ${pending.length} pending items in sync_queue`);
  if (pending.length === 0) return { pushed: 0, errors: 0 };

  // Group by table_name
  const grouped = new Map<string, SyncQueueItem[]>();
  for (const item of pending) {
    const list = grouped.get(item.table_name) || [];
    list.push(item);
    grouped.set(item.table_name, list);
  }

  // Build batch payload
  const batches: PushBatch[] = [];
  for (const [table, items] of grouped) {
    const operations: PushBatchOperation[] = items.map((item) => ({
      op: item.operation,
      payload: JSON.parse(item.payload),
      queue_id: item.id,
    }));
    batches.push({ table: toServerTable(table), operations });
  }

  let pushed = 0;
  let errors = 0;

  try {
    const client = await createSyncClient();
    const res = await client.post<PushResponse>('/sync/push', { batches });
    const { results } = res.data;

    const doneIds: string[] = [];
    const syncedByTable = new Map<string, string[]>();

    for (const r of results) {
      if (r.status === 'ok') {
        doneIds.push(r.queue_id);
        pushed++;

        const queueItem = pending.find((p: SyncQueueItem) => p.id === r.queue_id);
        if (queueItem) {
          const list = syncedByTable.get(queueItem.table_name) || [];
          list.push(queueItem.record_id);
          syncedByTable.set(queueItem.table_name, list);

          // Update server_id on the local record if returned
          if (r.server_id) {
            const localTable = (db as any)[queueItem.table_name];
            if (localTable) {
              await localTable
                .where('_local_id')
                .equals(queueItem.record_id)
                .modify({ server_id: r.server_id });
            }
          }
        }
      } else {
        errors++;
        const queueItem = pending.find((p: SyncQueueItem) => p.id === r.queue_id);
        if (queueItem) {
          const newRetry = queueItem.retry_count + 1;
          const newStatus = newRetry >= 3 ? 'manual_review' : 'failed';
          await db.sync_queue.update(r.queue_id, {
            retry_count: newRetry,
            status: newStatus as any,
          });
        }
      }
    }

    // Mark queue items as done
    await db.sync_queue.bulkUpdate(
      doneIds.map((id) => ({ key: id, changes: { status: 'done' as any } })),
    );

    // Mark data records as synced
    for (const [table, localIds] of syncedByTable) {
      const localTable = (db as any)[table];
      if (localTable) {
        for (const localId of localIds) {
          await localTable
            .where('_local_id')
            .equals(localId)
            .modify({ _synced: 1 });
        }
      }
    }
  } catch (err) {
    // Network error — mark all as failed
    for (const item of pending) {
      const newRetry = item.retry_count + 1;
      const newStatus = newRetry >= 3 ? 'manual_review' : 'failed';
      await db.sync_queue.update(item.id, {
        retry_count: newRetry,
        status: newStatus as any,
      });
    }
    errors = pending.length;
    console.error('[SyncEngine Desktop] Push failed:', err);
  }

  return { pushed, errors };
}

/* ─── PULL: Server → Local ────────────────────────────── */

export async function pullDelta(): Promise<{ pulled: number; skipped: number }> {
  const meta = await db.sync_meta.get('last_pulled_at');
  const lastPulledAt = meta?.value || '1970-01-01T00:00:00.000Z';

  const serverTables = SYNCABLE_TABLES.map(toServerTable).join(',');

  let pulled = 0;
  let skipped = 0;

  try {
    const client = await createSyncClient();
    const res = await client.get<PullResponse>('/sync/pull', {
      params: { since: lastPulledAt, tables: serverTables },
    });

    const { tables, server_time } = res.data;

    for (const [serverTable, rows] of Object.entries(tables)) {
      // Reverse-map server table name to local table name
      let localTableName = serverTable;
      for (const [local, server] of Object.entries(TABLE_NAME_MAP)) {
        if (server === serverTable) {
          localTableName = local;
          break;
        }
      }

      const localTable = (db as any)[localTableName];
      if (!localTable) continue;

      for (const serverRow of rows) {
        const serverId = String(serverRow.id ?? '');
        const serverLocalId = serverRow._local_id
          ? String(serverRow._local_id)
          : null;

        // Find existing local record
        let existing: any = null;

        if (serverLocalId) {
          existing = await localTable
            .where('_local_id')
            .equals(serverLocalId)
            .first();
        }

        if (!existing && serverId) {
          existing = await localTable
            .where('server_id')
            .equals(serverId)
            .first();
        }

        if (existing) {
          // CONFLICT CHECK: Don't overwrite if local has unsynced changes
          if (existing._synced === 0) {
            skipped++;
            continue;
          }

          // Server timestamp wins
          const serverUpdatedAt = String(serverRow.updated_at ?? '');
          const localUpdatedAt = existing._updated_at ?? '';

          if (localUpdatedAt && serverUpdatedAt && serverUpdatedAt <= localUpdatedAt) {
            skipped++;
            continue;
          }

          // Update existing record with server data
          const updateData: Record<string, unknown> = { ...serverRow };
          updateData.server_id = serverId;
          updateData._synced = 1;
          updateData._deleted = serverRow.deleted_at ? 1 : 0;
          updateData._updated_at = serverUpdatedAt || new Date().toISOString();
          delete updateData.id;
          delete updateData.deleted_at;

          await localTable.update(existing.id, updateData);
          pulled++;

          // Synchronize local 'inventory' table with 'quantity_remaining' from server
          if (localTableName === 'batches' && serverRow.quantity_remaining !== undefined) {
            const invRecord = await db.inventory.where('batch_id').equals(existing.id).first();
            if (invRecord) {
              await db.inventory.update(invRecord.id, {
                quantity: Number(serverRow.quantity_remaining),
                updated_at: String(updateData._updated_at),
                last_modified: Date.now()
              });
            } else {
              const invId = crypto.randomUUID();
              await db.inventory.add({
                id: invId,
                _local_id: invId,
                batch_id: existing.id,
                quantity: Number(serverRow.quantity_remaining),
                location: 'Store-Front',
                _synced: 1,
                _deleted: 0,
                created_at: String(updateData._updated_at),
                updated_at: String(updateData._updated_at),
                last_modified: Date.now()
              });
            }
          }
        } else {
          // New record from server
          const newRecord: Record<string, unknown> = { ...serverRow };
          const newId = serverLocalId || crypto.randomUUID();
          newRecord.id = newId;
          newRecord._local_id = newId;
          newRecord.server_id = serverId;
          newRecord._synced = 1;
          newRecord._deleted = serverRow.deleted_at ? 1 : 0;
          newRecord._updated_at = String(serverRow.updated_at ?? new Date().toISOString());
          newRecord.last_modified = Date.now();
          delete (newRecord as any).deleted_at;

          await localTable.add(newRecord);
          pulled++;

          // Synchronize local 'inventory' table with 'quantity_remaining' from server
          if (localTableName === 'batches' && serverRow.quantity_remaining !== undefined) {
            const invId = crypto.randomUUID();
            await db.inventory.add({
              id: invId,
              _local_id: invId,
              batch_id: String(newRecord.id),
              quantity: Number(serverRow.quantity_remaining),
              location: 'Store-Front',
              _synced: 1,
              _deleted: 0,
              created_at: String(newRecord._updated_at),
              updated_at: String(newRecord._updated_at),
              last_modified: Date.now()
            });
          }
        }
      }
    }

    // Update last_pulled_at
    await db.sync_meta.put({ key: 'last_pulled_at', value: server_time });
  } catch (err) {
    console.error('[SyncEngine Desktop] Pull failed:', err);
  }

  return { pulled, skipped };
}

/* ─── FULL SYNC CYCLE ─────────────────────────────────── */

export async function runSyncCycle(): Promise<SyncResult> {
  const pushResult = await pushQueue();
  const pullResult = await pullDelta();

  // Hydrate Redux stores after pulling new data so the UI reflects server state
  if (pullResult.pulled > 0) {
    try {
      await HydrationService.hydrateAll();
      // Invalidate React Query caches so dashboard/list pages re-read from updated IndexedDB
      queryClient.invalidateQueries();
      console.log(`[SyncEngine] Hydrated Redux + invalidated queries after pulling ${pullResult.pulled} records`);
    } catch (err) {
      console.error('[SyncEngine] Post-pull hydration failed:', err);
    }
  }

  return {
    pushed: pushResult.pushed,
    pulled: pullResult.pulled,
    errors: pushResult.errors,
    skipped: pullResult.skipped,
  };
}

/* ─── MANUAL SYNC ─────────────────────────────────────── */

export async function manualSync(): Promise<SyncResult> {
  console.log('[ManualSync Desktop] Starting manual sync...');
  
  // Diagnostic: count records in each syncable table
  for (const table of SYNCABLE_TABLES) {
    try {
      const count = await (db as any)[table]?.count();
      console.log(`[ManualSync Desktop] Local table '${table}': ${count ?? 'N/A'} records`);
    } catch { /* ignore */ }
  }
  
  // Diagnostic: count sync_queue items by status
  const queueAll = await db.sync_queue.toArray();
  const statusCounts: Record<string, number> = {};
  for (const item of queueAll) {
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  }
  console.log('[ManualSync Desktop] sync_queue breakdown:', statusCounts);
  
  const result = await runSyncCycle();
  console.log('[ManualSync Desktop] Completed:', result);
  return result;
}

/* ─── BACKGROUND SYNC (setInterval) ──────────────────── */

let syncIntervalId: ReturnType<typeof setInterval> | null = null;

const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Start the background sync interval.
 * Uses document.visibilityState to skip sync when the window is hidden.
 */
export function startBackgroundSync(): void {
  if (syncIntervalId) return; // Already running

  syncIntervalId = setInterval(async () => {
    // Only sync when the window is visible (save resources)
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    try {
      await runSyncCycle();
    } catch (err) {
      console.error('[BackgroundSync Desktop] Cycle failed:', err);
    }
  }, SYNC_INTERVAL_MS);

  console.log('[BackgroundSync Desktop] Started (interval: 30min)');
}

/**
 * Stop the background sync interval.
 */
export function stopBackgroundSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    console.log('[BackgroundSync Desktop] Stopped');
  }
}

/* ─── PENDING COUNT ───────────────────────────────────── */

export async function getPendingSyncCount(): Promise<number> {
  return db.sync_queue
    .where('status')
    .anyOf('pending', 'failed')
    .count();
}

/**
 * Forcefully push ALL local data directly to the server.
 * Bypasses the sync_queue and hooks entirely — reads Dexie, builds payloads, POSTs directly.
 */
export async function forceQueueAllLocalData(): Promise<number> {
  let totalPushed = 0;

  const token = await getAuthToken();
  if (!token) {
    console.error('[ForceUpload] No auth token available — cannot push to server.');
    throw new Error('Not authenticated. Please log in first.');
  }

  console.log('[ForceUpload] Auth token present. Starting force upload...');

  for (const table of SYNCABLE_TABLES) {
    const localTable = (db as any)[table];
    if (!localTable) {
      console.log(`[ForceUpload] Skipping '${table}' — table not found in Dexie`);
      continue;
    }

    const allRecords = await localTable.toArray();
    console.log(`[ForceUpload] Table '${table}': ${allRecords.length} records`);

    if (allRecords.length === 0) continue;

    // Build operations for this table
    const operations = allRecords.map((record: any) => {
      // Ensure _local_id exists
      const localId = record._local_id || record.id;
      // Build a clean payload — strip local-only fields
      const payload = { ...record };
      delete payload._synced;
      delete payload._deleted;
      delete payload._updated_at;
      delete payload.server_id;
      delete payload.last_modified;
      // Keep _local_id, delete the local 'id' (server generates its own)
      payload._local_id = localId;
      delete payload.id;

      return {
        op: 'INSERT' as const,
        payload,
        queue_id: `force-${localId}`,
      };
    });

    const serverTable = toServerTable(table);
    console.log(`[ForceUpload] Pushing ${operations.length} records to '${serverTable}'...`);

    try {
      const client = await createSyncClient();
      const res = await client.post('/sync/push', {
        batches: [{ table: serverTable, operations }],
      });

      const results = res.data?.results || [];
      let ok = 0, err = 0;
      for (const r of results) {
        if (r.status === 'ok') ok++;
        else {
          err++;
          console.error(`[ForceUpload] Error for ${serverTable}/${r.queue_id}:`, r.error);
        }
      }
      console.log(`[ForceUpload] ${serverTable}: ${ok} pushed, ${err} errors`);
      totalPushed += ok;
    } catch (e: any) {
      console.error(`[ForceUpload] Failed to push '${serverTable}':`, e.response?.data || e.message);
    }
  }

  console.log(`[ForceUpload] Complete. Total pushed: ${totalPushed}`);
  return totalPushed;
}
