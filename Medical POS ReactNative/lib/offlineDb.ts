import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync('medpos_offline.db');
  }
  return dbInstance;
}

export function initOfflineDb(): void {
  const db = getDb();
  db.execSync(`
    CREATE TABLE IF NOT EXISTS offline_sales (
      id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced INTEGER DEFAULT 0,
      sync_error TEXT
    );
    CREATE TABLE IF NOT EXISTS offline_medicines_cache (
      id TEXT PRIMARY KEY NOT NULL,
      clinic_id TEXT NOT NULL,
      name TEXT NOT NULL,
      generic_name TEXT,
      barcode TEXT,
      current_stock INTEGER DEFAULT 0,
      mrp REAL,
      batch_id TEXT,
      expiry_date TEXT,
      cached_at TEXT NOT NULL
    );
  `);
}

export function cacheMedicines(medicines: Array<Record<string, unknown>>): void {
  const db = getDb();
  for (const m of medicines) {
    db.runSync(
      `INSERT OR REPLACE INTO offline_medicines_cache
       (id, clinic_id, name, generic_name, barcode, current_stock, mrp, batch_id, expiry_date, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(m.id),
        String(m.clinic_id ?? ''),
        String(m.name ?? ''),
        m.generic_name != null ? String(m.generic_name) : null,
        m.barcode != null ? String(m.barcode) : null,
        Number(m.total_stock ?? m.current_stock ?? 0),
        m.mrp != null ? Number(m.mrp) : null,
        m.batch_id != null ? String(m.batch_id) : null,
        m.expiry_date != null ? String(m.expiry_date) : null,
        new Date().toISOString(),
      ]
    );
  }
}

export function queueOfflineSale(payload: unknown): string {
  const db = getDb();
  const id = `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  db.runSync('INSERT INTO offline_sales (id, payload, created_at) VALUES (?, ?, ?)', [
    id,
    JSON.stringify(payload),
    new Date().toISOString(),
  ]);
  return id;
}

export function getPendingSales(): Array<{ id: string; payload: string }> {
  const db = getDb();
  return db.getAllSync<{ id: string; payload: string }>(
    'SELECT id, payload FROM offline_sales WHERE synced = 0 ORDER BY created_at ASC'
  );
}

export function markSaleSynced(id: string): void {
  const db = getDb();
  db.runSync('UPDATE offline_sales SET synced = 1 WHERE id = ?', [id]);
}

export function markSaleFailed(id: string, errorMessage: string): void {
  const db = getDb();
  db.runSync('UPDATE offline_sales SET sync_error = ? WHERE id = ?', [errorMessage, id]);
}

export function pendingSalesCount(): number {
  const db = getDb();
  const row = db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM offline_sales WHERE synced = 0');
  return row?.c ?? 0;
}
