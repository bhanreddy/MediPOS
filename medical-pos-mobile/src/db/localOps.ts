/**
 * localOps.ts — Generic local CRUD + sync queue enqueue functions.
 *
 * EVERY mutation flows through here:
 *   1. Write to local SQLite table immediately (optimistic UI)
 *   2. Enqueue a sync_queue row (for later push to server)
 *
 * EVERY read comes from local SQLite — never from the server directly.
 */
import * as Crypto from 'expo-crypto';
import { getLocalDb } from './localDb';
import type { SyncableTable } from './initDb';

/* ─── Types ───────────────────────────────────────────── */

export interface LocalRecord {
  _local_id: string;
  _synced: number;
  _deleted: number;
  _updated_at: string;
  server_id: string | null;
  [key: string]: unknown;
}

export interface SyncQueueRow {
  id: string;
  table_name: string;
  record_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: string;
  retry_count: number;
  created_at: string;
  status: 'pending' | 'failed' | 'done' | 'manual_review';
}

/* ─── Helpers ─────────────────────────────────────────── */

/** Generate a UUID v4 using expo-crypto (secure random). */
export function generateLocalId(): string {
  return Crypto.randomUUID();
}

/** Current ISO timestamp string. */
function now(): string {
  return new Date().toISOString();
}

/* ─── ENQUEUE ─────────────────────────────────────────── */

/**
 * Insert a row into `sync_queue`. Called internally after every local mutation.
 */
function enqueue(
  tableName: SyncableTable,
  recordId: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: Record<string, unknown>,
): void {
  const db = getLocalDb();
  const id = generateLocalId();

  db.runSync(
    `INSERT INTO sync_queue (id, table_name, record_id, operation, payload, retry_count, created_at, status)
     VALUES (?, ?, ?, ?, ?, 0, ?, 'pending')`,
    [id, tableName, recordId, operation, JSON.stringify(payload), now()],
  );
}

/* ─── INSERT ──────────────────────────────────────────── */

/**
 * Insert a new record into a local table and enqueue for sync.
 *
 * @param table  - The syncable table name
 * @param data   - Column values (excluding _local_id, _synced, _deleted, _updated_at)
 * @returns The generated _local_id
 */
export function localInsert(
  table: SyncableTable,
  data: Record<string, unknown>,
): string {
  const db = getLocalDb();
  const localId = generateLocalId();
  const timestamp = now();

  // Merge sync columns
  const row: Record<string, unknown> = {
    ...data,
    _local_id: localId,
    _synced: 0,
    _deleted: 0,
    _updated_at: timestamp,
  };

  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map((c) => {
    const v = row[c];
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });

  db.runSync(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
    values as (string | number | null)[],
  );

  // Enqueue for sync push
  enqueue(table, localId, 'INSERT', row);

  return localId;
}

/* ─── UPDATE ──────────────────────────────────────────── */

/**
 * Update an existing local record by _local_id and enqueue for sync.
 *
 * @param table   - The syncable table name
 * @param localId - The _local_id of the record to update
 * @param changes - Only the columns being updated
 */
export function localUpdate(
  table: SyncableTable,
  localId: string,
  changes: Record<string, unknown>,
): void {
  const db = getLocalDb();
  const timestamp = now();

  // Always mark as unsynced + update timestamp
  const row: Record<string, unknown> = {
    ...changes,
    _synced: 0,
    _updated_at: timestamp,
  };

  const setClauses = Object.keys(row)
    .map((k) => `${k} = ?`)
    .join(', ');
  const values = Object.keys(row).map((k) => {
    const v = row[k];
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });

  db.runSync(
    `UPDATE ${table} SET ${setClauses} WHERE _local_id = ?`,
    [...(values as (string | number | null)[]), localId],
  );

  // Read full row for sync payload
  const fullRow = db.getFirstSync<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE _local_id = ?`,
    [localId],
  );

  if (fullRow) {
    enqueue(table, localId, 'UPDATE', fullRow);
  }
}

/* ─── SOFT DELETE ─────────────────────────────────────── */

/**
 * Soft-delete a record (set _deleted = 1) and enqueue for sync.
 * NEVER hard-deletes — medical compliance requirement.
 *
 * @param table   - The syncable table name
 * @param localId - The _local_id of the record to delete
 */
export function localDelete(table: SyncableTable, localId: string): void {
  const db = getLocalDb();
  const timestamp = now();

  db.runSync(
    `UPDATE ${table} SET _deleted = 1, _synced = 0, _updated_at = ? WHERE _local_id = ?`,
    [timestamp, localId],
  );

  const fullRow = db.getFirstSync<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE _local_id = ?`,
    [localId],
  );

  if (fullRow) {
    enqueue(table, localId, 'DELETE', fullRow);
  }
}

/* ─── READS (All from local DB) ──────────────────────── */

/**
 * Query all non-deleted records from a local table.
 * Optionally filter by clinic_id.
 */
export function localQueryAll<T = Record<string, unknown>>(
  table: SyncableTable,
  clinicId?: string,
  orderBy?: string,
): T[] {
  const db = getLocalDb();
  let sql = `SELECT * FROM ${table} WHERE _deleted = 0`;
  const params: (string | number)[] = [];

  if (clinicId) {
    sql += ' AND clinic_id = ?';
    params.push(clinicId);
  }

  if (orderBy) {
    sql += ` ORDER BY ${orderBy}`;
  }

  return db.getAllSync<T>(sql, params);
}

/**
 * Get a single record by _local_id.
 */
export function localGetById<T = Record<string, unknown>>(
  table: SyncableTable,
  localId: string,
): T | null {
  const db = getLocalDb();
  return db.getFirstSync<T>(
    `SELECT * FROM ${table} WHERE _local_id = ? AND _deleted = 0`,
    [localId],
  );
}

/**
 * Get a single record by its server_id (for pull-merge scenarios).
 */
export function localGetByServerId<T = Record<string, unknown>>(
  table: SyncableTable,
  serverId: string,
): T | null {
  const db = getLocalDb();
  return db.getFirstSync<T>(
    `SELECT * FROM ${table} WHERE server_id = ? AND _deleted = 0`,
    [serverId],
  );
}

/**
 * Search records with a LIKE query on a specific column.
 */
export function localSearch<T = Record<string, unknown>>(
  table: SyncableTable,
  column: string,
  query: string,
  clinicId?: string,
  limit = 50,
): T[] {
  const db = getLocalDb();
  let sql = `SELECT * FROM ${table} WHERE _deleted = 0 AND ${column} LIKE ?`;
  const params: (string | number)[] = [`%${query}%`];

  if (clinicId) {
    sql += ' AND clinic_id = ?';
    params.push(clinicId);
  }

  sql += ` LIMIT ?`;
  params.push(limit);

  return db.getAllSync<T>(sql, params);
}

/**
 * Run a raw SQL query against the local database (for complex reads like joins, aggregations).
 */
export function localRawQuery<T = Record<string, unknown>>(
  sql: string,
  params?: (string | number | null)[],
): T[] {
  const db = getLocalDb();
  return db.getAllSync<T>(sql, params ?? []);
}

/**
 * Run a raw SQL single-row query.
 */
export function localRawGetFirst<T = Record<string, unknown>>(
  sql: string,
  params?: (string | number | null)[],
): T | null {
  const db = getLocalDb();
  return db.getFirstSync<T>(sql, params ?? []);
}

/* ─── SYNC QUEUE READS ────────────────────────────────── */

/**
 * Get all pending sync queue items, optionally filtered by table.
 */
export function getPendingSyncItems(table?: SyncableTable): SyncQueueRow[] {
  const db = getLocalDb();
  if (table) {
    return db.getAllSync<SyncQueueRow>(
      `SELECT * FROM sync_queue WHERE status = 'pending' AND table_name = ? ORDER BY created_at ASC`,
      [table],
    );
  }
  return db.getAllSync<SyncQueueRow>(
    `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC`,
  );
}

/**
 * Mark sync queue items as done.
 */
export function markSyncItemsDone(ids: string[]): void {
  if (ids.length === 0) return;
  const db = getLocalDb();
  const placeholders = ids.map(() => '?').join(', ');
  db.runSync(
    `UPDATE sync_queue SET status = 'done' WHERE id IN (${placeholders})`,
    ids,
  );
}

/**
 * Increment retry count and optionally flag for manual review.
 */
export function markSyncItemFailed(id: string, maxRetries = 3): void {
  const db = getLocalDb();
  const item = db.getFirstSync<SyncQueueRow>(
    `SELECT * FROM sync_queue WHERE id = ?`,
    [id],
  );
  if (!item) return;

  const newRetry = item.retry_count + 1;
  const newStatus = newRetry >= maxRetries ? 'manual_review' : 'failed';

  db.runSync(
    `UPDATE sync_queue SET retry_count = ?, status = ? WHERE id = ?`,
    [newRetry, newStatus, id],
  );
}

/**
 * Mark records as synced after successful push confirmation.
 * Updates the _synced flag on the actual data table.
 */
export function markRecordsSynced(
  table: SyncableTable,
  localIds: string[],
): void {
  if (localIds.length === 0) return;
  const db = getLocalDb();
  const placeholders = localIds.map(() => '?').join(', ');
  db.runSync(
    `UPDATE ${table} SET _synced = 1 WHERE _local_id IN (${placeholders})`,
    localIds,
  );
}

/**
 * Get the count of pending sync items.
 */
export function getPendingSyncCount(): number {
  const db = getLocalDb();
  const result = db.getFirstSync<{ count: number }>(
    `SELECT COUNT(*) as count FROM sync_queue WHERE status IN ('pending', 'failed')`,
  );
  return result?.count ?? 0;
}

/* ─── SYNC META (last_pulled_at) ──────────────────────── */

export function getSyncMeta(key: string): string | null {
  const db = getLocalDb();
  const row = db.getFirstSync<{ value: string }>(
    `SELECT value FROM sync_meta WHERE key = ?`,
    [key],
  );
  return row?.value ?? null;
}

export function setSyncMeta(key: string, value: string): void {
  const db = getLocalDb();
  db.runSync(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

/* ─── BULK UPSERT (for pull-from-server) ──────────────── */

/**
 * Upsert a server record into local DB (used during PULL).
 *
 * Conflict resolution: LAST-WRITE-WINS
 *   - If local record has _synced = 0 (pending local changes), SKIP overwrite.
 *   - Otherwise, overwrite with server data.
 *
 * @returns 'inserted' | 'updated' | 'skipped'
 */
export function upsertFromServer(
  table: SyncableTable,
  serverRow: Record<string, unknown>,
): 'inserted' | 'updated' | 'skipped' {
  const db = getLocalDb();
  const serverId = String(serverRow.id ?? serverRow._local_id ?? '');
  const serverLocalId = serverRow._local_id ? String(serverRow._local_id) : null;

  // Check if record already exists locally (by server_id or _local_id)
  let existing: LocalRecord | null = null;

  if (serverLocalId) {
    existing = db.getFirstSync<LocalRecord>(
      `SELECT * FROM ${table} WHERE _local_id = ?`,
      [serverLocalId],
    );
  }

  if (!existing && serverId) {
    existing = db.getFirstSync<LocalRecord>(
      `SELECT * FROM ${table} WHERE server_id = ?`,
      [serverId],
    );
  }

  if (existing) {
    // CONFLICT CHECK: Don't overwrite if local has unsynced changes
    if (existing._synced === 0) {
      return 'skipped';
    }

    // Server timestamp wins — overwrite local
    const serverUpdatedAt = String(serverRow.updated_at ?? '');
    const localUpdatedAt = existing._updated_at ?? '';

    // Only update if server is newer (or always update if no local timestamp)
    if (localUpdatedAt && serverUpdatedAt && serverUpdatedAt <= localUpdatedAt) {
      return 'skipped';
    }

    // Build update from server data
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(serverRow)) {
      if (key === 'id') {
        updateData.server_id = value;
      } else if (key === '_local_id') {
        // _local_id stays as-is on existing records
      } else if (key === 'deleted_at') {
        updateData._deleted = value ? 1 : 0;
      } else if (key === 'updated_at') {
        updateData._updated_at = value;
      } else {
        updateData[key] = value;
      }
    }

    updateData._synced = 1;

    const setClauses = Object.keys(updateData)
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = Object.keys(updateData).map((k) => {
      const v = updateData[k];
      if (v === null || v === undefined) return null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      return v;
    });

    db.runSync(
      `UPDATE ${table} SET ${setClauses} WHERE _local_id = ?`,
      [...(values as (string | number | null)[]), existing._local_id],
    );

    return 'updated';
  }

  // New record from server — insert
  const localId = serverLocalId ?? generateLocalId();
  const insertData: Record<string, unknown> = {
    _local_id: localId,
    _synced: 1,
    _deleted: serverRow.deleted_at ? 1 : 0,
    _updated_at: String(serverRow.updated_at ?? now()),
    server_id: serverId || null,
  };

  for (const [key, value] of Object.entries(serverRow)) {
    if (['id', '_local_id', 'updated_at', 'deleted_at'].includes(key)) continue;
    insertData[key] = value;
  }

  const cols = Object.keys(insertData);
  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map((c) => {
    const v = insertData[c];
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });

  db.runSync(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
    values as (string | number | null)[],
  );

  return 'inserted';
}
