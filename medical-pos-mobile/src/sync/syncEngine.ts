/**
 * syncEngine.ts — Push + Pull sync engine for the mobile app.
 *
 * RULE: Always PUSH before PULL.
 *   Push: Local queue → Server (POST /api/sync/push)
 *   Pull: Server delta → Local (GET /api/sync/pull)
 */
import { apiClient } from '../api/client';
import { getLocalDb } from '../db/localDb';
import {
  getPendingSyncItems,
  markSyncItemsDone,
  markSyncItemFailed,
  markRecordsSynced,
  upsertFromServer,
  getSyncMeta,
  setSyncMeta,
} from '../db/localOps';
import { SYNCABLE_TABLES, type SyncableTable } from '../db/initDb';
import type { SyncQueueRow } from '../db/localOps';

/* ─── Types ───────────────────────────────────────────── */

interface PushBatchOperation {
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown>;
  queue_id: string; // local sync_queue.id for status tracking
}

interface PushBatch {
  table: string;
  operations: PushBatchOperation[];
}

interface PushRequest {
  batches: PushBatch[];
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
  tables: Record<
    string,
    Array<Record<string, unknown>>
  >;
  server_time: string;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  errors: number;
  skipped: number;
}

/* ─── PUSH: Local → Server ────────────────────────────── */

/**
 * Read all pending sync_queue items, group by table, and send a single
 * batched POST to /api/sync/push.
 *
 * On success: mark queue rows as 'done' + set _synced = 1 on data rows.
 * On failure: increment retry_count, flag for manual_review after 3 retries.
 */
export async function pushQueue(): Promise<{ pushed: number; errors: number }> {
  const pending = getPendingSyncItems();
  if (pending.length === 0) return { pushed: 0, errors: 0 };

  // Group by table_name
  const grouped = new Map<string, SyncQueueRow[]>();
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
    batches.push({ table, operations });
  }

  const request: PushRequest = { batches };

  let pushed = 0;
  let errors = 0;

  try {
    const res = await apiClient.post<PushResponse>('/sync/push', request, {
      timeout: 30_000,
    });
    const { results } = res.data;

    const doneIds: string[] = [];
    const syncedByTable = new Map<string, string[]>();

    for (const r of results) {
      if (r.status === 'ok') {
        doneIds.push(r.queue_id);
        pushed++;

        // Track which records to mark as synced
        const queueItem = pending.find((p) => p.id === r.queue_id);
        if (queueItem) {
          const list = syncedByTable.get(queueItem.table_name) || [];
          list.push(queueItem.record_id);
          syncedByTable.set(queueItem.table_name, list);

          // If server returned a server_id, update the local record
          if (r.server_id) {
            const db = getLocalDb();
            db.runSync(
              `UPDATE ${queueItem.table_name} SET server_id = ? WHERE _local_id = ?`,
              [r.server_id, queueItem.record_id],
            );
          }
        }
      } else {
        errors++;
        markSyncItemFailed(r.queue_id);
      }
    }

    // Mark all successful queue items as done
    markSyncItemsDone(doneIds);

    // Mark actual data records as synced
    for (const [table, localIds] of syncedByTable) {
      markRecordsSynced(table as SyncableTable, localIds);
    }
  } catch (err) {
    // Network error — mark all as failed (they'll retry next cycle)
    for (const item of pending) {
      markSyncItemFailed(item.id);
    }
    errors = pending.length;
    console.error('[SyncEngine] Push failed:', err);
  }

  return { pushed, errors };
}

/* ─── PULL: Server → Local ────────────────────────────── */

/**
 * Fetch delta records from server since `last_pulled_at`.
 * Upsert into local DB using conflict resolution (last-write-wins,
 * but never overwrite local unsynced changes).
 */
export async function pullDelta(): Promise<{
  pulled: number;
  skipped: number;
}> {
  const lastPulledAt = getSyncMeta('last_pulled_at') || '1970-01-01T00:00:00.000Z';

  const tables = SYNCABLE_TABLES.join(',');

  let pulled = 0;
  let skipped = 0;

  try {
    const res = await apiClient.get<PullResponse>('/sync/pull', {
      params: { since: lastPulledAt, tables },
      timeout: 30_000,
    });

    const { tables: serverTables, server_time } = res.data;

    for (const [tableName, rows] of Object.entries(serverTables)) {
      if (!SYNCABLE_TABLES.includes(tableName as SyncableTable)) continue;

      for (const row of rows) {
        const result = upsertFromServer(tableName as SyncableTable, row);
        if (result === 'skipped') {
          skipped++;
        } else {
          pulled++;
        }
      }
    }

    // Update last_pulled_at to server's time
    setSyncMeta('last_pulled_at', server_time);
  } catch (err) {
    console.error('[SyncEngine] Pull failed:', err);
  }

  return { pulled, skipped };
}

/* ─── FULL SYNC CYCLE ─────────────────────────────────── */

/**
 * Run a full sync cycle: PUSH first, then PULL.
 * Always push before pull — we want our data on server before fetching latest.
 */
export async function runSyncCycle(): Promise<SyncResult> {
  const pushResult = await pushQueue();
  const pullResult = await pullDelta();

  return {
    pushed: pushResult.pushed,
    pulled: pullResult.pulled,
    errors: pushResult.errors,
    skipped: pullResult.skipped,
  };
}

/* ─── VERIFY (for critical records) ───────────────────── */

/**
 * Verify that specific records have been confirmed on the server.
 * Use for critical data like prescriptions, billing records.
 *
 * @param localIds - Array of _local_id values to verify
 * @returns Map of _local_id → confirmed (boolean)
 */
export async function verifyRecords(
  localIds: string[],
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();

  try {
    const res = await apiClient.post<{
      verified: Array<{ _local_id: string; confirmed: boolean }>;
    }>('/sync/verify', { local_ids: localIds });

    for (const v of res.data.verified) {
      result.set(v._local_id, v.confirmed);
    }
  } catch (err) {
    console.error('[SyncEngine] Verify failed:', err);
    // On error, assume not verified
    for (const id of localIds) {
      result.set(id, false);
    }
  }

  return result;
}
