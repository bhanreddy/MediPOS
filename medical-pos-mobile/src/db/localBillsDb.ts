import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDb() {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('bills_sync.db');
    await dbInstance.execAsync(`
      CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        synced INTEGER DEFAULT 0,
        error TEXT
      );
    `);
  }
  return dbInstance;
}

export async function insertBillLocal(bill: any) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO bills (id, clinic_id, payload, created_at, synced) VALUES (?, ?, ?, ?, ?)`,
    [bill.id, bill.clinic_id, JSON.stringify(bill), new Date().toISOString(), 0]
  );
}

export async function addToSyncQueue(operation: string, payload: any) {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO sync_queue (id, operation, payload, created_at, retry_count, synced) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, operation, JSON.stringify(payload), new Date().toISOString(), 0, 0]
  );
}

export async function getPendingQueue() {
  const db = await getDb();
  return await db.getAllAsync(
    `SELECT * FROM sync_queue WHERE synced = 0 AND retry_count < 3 ORDER BY created_at ASC`
  );
}

export async function markQueueItemSynced(id: string) {
  const db = await getDb();
  await db.runAsync(`UPDATE sync_queue SET synced = 1 WHERE id = ?`, [id]);
}

export async function incrementQueueRetry(id: string, error: string) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sync_queue SET retry_count = retry_count + 1, error = ? WHERE id = ?`,
    [error, id]
  );
}
