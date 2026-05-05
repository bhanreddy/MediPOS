/**
 * initDb.ts — Creates all local SQLite tables mirroring Supabase schema.
 *
 * Every table includes the 4 offline-first columns:
 *   _local_id   TEXT PRIMARY KEY  — client-generated UUID (local PK)
 *   _synced     INTEGER DEFAULT 0 — 0 = unsynced, 1 = synced
 *   _deleted    INTEGER DEFAULT 0 — soft-delete flag (never hard delete)
 *   _updated_at TEXT              — ISO timestamp of last local mutation
 *
 * IMPORTANT:
 *   - The server's `id` (uuid) is stored as `server_id` locally.
 *   - `_local_id` is the PRIMARY KEY used for all local operations.
 *   - Foreign key references use the local `_local_id` where possible,
 *     or `server_id` for records that came from the server.
 */
import { getLocalDb } from './localDb';

const SCHEMA_VERSION = 1;

/**
 * Run this once on app startup (before any reads/writes).
 * Uses a user_version pragma to track schema migrations.
 */
export function initLocalDatabase(): void {
  const db = getLocalDb();

  const currentVersion = db.getFirstSync<{ user_version: number }>(
    'PRAGMA user_version;'
  )?.user_version ?? 0;

  if (currentVersion >= SCHEMA_VERSION) return; // Already up to date

  db.execSync('BEGIN TRANSACTION;');

  try {
    // ─── SYNC QUEUE ──────────────────────────────────────────
    db.execSync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id          TEXT PRIMARY KEY,
        table_name  TEXT NOT NULL,
        record_id   TEXT NOT NULL,
        operation   TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
        payload     TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        created_at  TEXT NOT NULL,
        status      TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'failed', 'done', 'manual_review'))
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_sq_status ON sync_queue(status);`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_sq_table  ON sync_queue(table_name, status);`);

    // ─── SYNC META ───────────────────────────────────────────
    db.execSync(`
      CREATE TABLE IF NOT EXISTS sync_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // ─── CLINICS ─────────────────────────────────────────────
    db.execSync(`
      CREATE TABLE IF NOT EXISTS clinics (
        _local_id             TEXT PRIMARY KEY,
        _synced               INTEGER DEFAULT 0,
        _deleted              INTEGER DEFAULT 0,
        _updated_at           TEXT,
        server_id             TEXT UNIQUE,
        name                  TEXT NOT NULL,
        slug                  TEXT,
        address               TEXT,
        phone                 TEXT,
        email                 TEXT,
        gstin                 TEXT,
        drug_licence_number   TEXT,
        logo_url              TEXT,
        signature_url         TEXT,
        invoice_footer        TEXT DEFAULT 'Valid prescription required for Schedule H/H1 drugs.',
        plan                  TEXT DEFAULT 'trial',
        is_active             INTEGER DEFAULT 1,
        created_at            TEXT
      );
    `);

    // ─── SUPPLIERS ───────────────────────────────────────────
    db.execSync(`
      CREATE TABLE IF NOT EXISTS suppliers (
        _local_id             TEXT PRIMARY KEY,
        _synced               INTEGER DEFAULT 0,
        _deleted              INTEGER DEFAULT 0,
        _updated_at           TEXT,
        server_id             TEXT UNIQUE,
        clinic_id             TEXT NOT NULL,
        name                  TEXT NOT NULL,
        phone                 TEXT,
        email                 TEXT,
        gstin                 TEXT,
        drug_licence_number   TEXT,
        address               TEXT,
        outstanding_balance   REAL DEFAULT 0,
        is_active             INTEGER DEFAULT 1,
        created_at            TEXT
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_suppliers_clinic ON suppliers(clinic_id);`);

    // ─── CUSTOMERS ───────────────────────────────────────────
    db.execSync(`
      CREATE TABLE IF NOT EXISTS customers (
        _local_id             TEXT PRIMARY KEY,
        _synced               INTEGER DEFAULT 0,
        _deleted              INTEGER DEFAULT 0,
        _updated_at           TEXT,
        server_id             TEXT UNIQUE,
        clinic_id             TEXT NOT NULL,
        name                  TEXT NOT NULL,
        phone                 TEXT,
        email                 TEXT,
        doctor_name           TEXT,
        address               TEXT,
        outstanding_balance   REAL DEFAULT 0,
        total_purchases       REAL DEFAULT 0,
        importance_score      INTEGER DEFAULT 0,
        last_purchase_date    TEXT,
        is_active             INTEGER DEFAULT 1,
        created_at            TEXT
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_customers_clinic ON customers(clinic_id);`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_customers_phone  ON customers(clinic_id, phone);`);

    // ─── MEDICINES ───────────────────────────────────────────
    db.execSync(`
      CREATE TABLE IF NOT EXISTS medicines (
        _local_id             TEXT PRIMARY KEY,
        _synced               INTEGER DEFAULT 0,
        _deleted              INTEGER DEFAULT 0,
        _updated_at           TEXT,
        server_id             TEXT UNIQUE,
        clinic_id             TEXT NOT NULL,
        name                  TEXT NOT NULL,
        generic_name          TEXT,
        manufacturer          TEXT,
        category              TEXT DEFAULT 'tablet',
        hsn_code              TEXT,
        gst_rate              REAL DEFAULT 0,
        unit                  TEXT DEFAULT 'strip',
        is_schedule_h1        INTEGER DEFAULT 0,
        low_stock_threshold   INTEGER DEFAULT 10,
        barcode               TEXT,
        is_active             INTEGER DEFAULT 1,
        created_at            TEXT
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_medicines_clinic ON medicines(clinic_id);`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_medicines_name   ON medicines(name);`);

    // ─── MEDICINE BATCHES ────────────────────────────────────
    db.execSync(`
      CREATE TABLE IF NOT EXISTS medicine_batches (
        _local_id             TEXT PRIMARY KEY,
        _synced               INTEGER DEFAULT 0,
        _deleted              INTEGER DEFAULT 0,
        _updated_at           TEXT,
        server_id             TEXT UNIQUE,
        clinic_id             TEXT NOT NULL,
        medicine_id           TEXT NOT NULL,
        supplier_id           TEXT,
        purchase_id           TEXT,
        batch_number          TEXT NOT NULL,
        expiry_date           TEXT NOT NULL,
        mrp                   REAL NOT NULL,
        purchase_price        REAL NOT NULL,
        quantity_in           INTEGER NOT NULL,
        quantity_remaining    INTEGER NOT NULL,
        created_at            TEXT
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_mb_clinic   ON medicine_batches(clinic_id);`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_mb_medicine ON medicine_batches(medicine_id);`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_mb_expiry   ON medicine_batches(expiry_date);`);

    // ─── PURCHASES ───────────────────────────────────────────
    db.execSync(`
      CREATE TABLE IF NOT EXISTS purchases (
        _local_id             TEXT PRIMARY KEY,
        _synced               INTEGER DEFAULT 0,
        _deleted              INTEGER DEFAULT 0,
        _updated_at           TEXT,
        server_id             TEXT UNIQUE,
        clinic_id             TEXT NOT NULL,
        supplier_id           TEXT,
        invoice_number        TEXT,
        invoice_date          TEXT,
        bill_image_url        TEXT,
        subtotal              REAL DEFAULT 0,
        discount              REAL DEFAULT 0,
        gst_amount            REAL DEFAULT 0,
        net_amount            REAL DEFAULT 0,
        payment_status        TEXT DEFAULT 'unpaid',
        paid_amount           REAL DEFAULT 0,
        notes                 TEXT,
        created_by            TEXT,
        created_at            TEXT
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_purchases_clinic ON purchases(clinic_id);`);

    // ─── PURCHASE ITEMS ──────────────────────────────────────
    db.execSync(`
      CREATE TABLE IF NOT EXISTS purchase_items (
        _local_id             TEXT PRIMARY KEY,
        _synced               INTEGER DEFAULT 0,
        _deleted              INTEGER DEFAULT 0,
        _updated_at           TEXT,
        server_id             TEXT UNIQUE,
        clinic_id             TEXT NOT NULL,
        purchase_id           TEXT NOT NULL,
        medicine_id           TEXT NOT NULL,
        batch_id              TEXT,
        batch_number          TEXT NOT NULL,
        expiry_date           TEXT NOT NULL,
        quantity              INTEGER NOT NULL,
        purchase_price        REAL NOT NULL,
        mrp                   REAL NOT NULL,
        gst_rate              REAL DEFAULT 0,
        discount              REAL DEFAULT 0,
        total                 REAL DEFAULT 0
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_pi_purchase ON purchase_items(purchase_id);`);

    // ─── SALES ───────────────────────────────────────────────
    db.execSync(`
      CREATE TABLE IF NOT EXISTS sales (
        _local_id             TEXT PRIMARY KEY,
        _synced               INTEGER DEFAULT 0,
        _deleted              INTEGER DEFAULT 0,
        _updated_at           TEXT,
        server_id             TEXT UNIQUE,
        clinic_id             TEXT NOT NULL,
        customer_id           TEXT,
        invoice_number        TEXT NOT NULL,
        sale_date             TEXT NOT NULL,
        subtotal              REAL DEFAULT 0,
        discount              REAL DEFAULT 0,
        gst_amount            REAL DEFAULT 0,
        net_amount            REAL DEFAULT 0,
        payment_mode          TEXT DEFAULT 'cash',
        payment_status        TEXT DEFAULT 'paid',
        paid_amount           REAL DEFAULT 0,
        balance_due           REAL DEFAULT 0,
        served_by             TEXT,
        is_return             INTEGER DEFAULT 0,
        return_of             TEXT,
        created_at            TEXT
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_sales_clinic ON sales(clinic_id);`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_sales_date   ON sales(sale_date);`);

    // ─── SALE ITEMS ──────────────────────────────────────────
    db.execSync(`
      CREATE TABLE IF NOT EXISTS sale_items (
        _local_id             TEXT PRIMARY KEY,
        _synced               INTEGER DEFAULT 0,
        _deleted              INTEGER DEFAULT 0,
        _updated_at           TEXT,
        server_id             TEXT UNIQUE,
        clinic_id             TEXT NOT NULL,
        sale_id               TEXT NOT NULL,
        medicine_id           TEXT NOT NULL,
        batch_id              TEXT NOT NULL,
        quantity              INTEGER NOT NULL,
        mrp                   REAL NOT NULL,
        discount_pct          REAL DEFAULT 0,
        gst_rate              REAL DEFAULT 0,
        total                 REAL DEFAULT 0
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_si_sale ON sale_items(sale_id);`);

    // ─── EXPENSES ────────────────────────────────────────────
    db.execSync(`
      CREATE TABLE IF NOT EXISTS expenses (
        _local_id             TEXT PRIMARY KEY,
        _synced               INTEGER DEFAULT 0,
        _deleted              INTEGER DEFAULT 0,
        _updated_at           TEXT,
        server_id             TEXT UNIQUE,
        clinic_id             TEXT NOT NULL,
        category              TEXT NOT NULL,
        description           TEXT,
        amount                REAL NOT NULL,
        expense_date          TEXT NOT NULL,
        payment_mode          TEXT DEFAULT 'cash',
        recorded_by           TEXT,
        created_at            TEXT
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_expenses_clinic ON expenses(clinic_id);`);

    // ─── SHORTBOOK ───────────────────────────────────────────
    db.execSync(`
      CREATE TABLE IF NOT EXISTS shortbook (
        _local_id             TEXT PRIMARY KEY,
        _synced               INTEGER DEFAULT 0,
        _deleted              INTEGER DEFAULT 0,
        _updated_at           TEXT,
        server_id             TEXT UNIQUE,
        clinic_id             TEXT NOT NULL,
        medicine_id           TEXT NOT NULL,
        reason                TEXT NOT NULL,
        quantity_needed       INTEGER,
        preferred_supplier_id TEXT,
        is_ordered            INTEGER DEFAULT 0,
        ordered_at            TEXT,
        created_at            TEXT
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_shortbook_clinic ON shortbook(clinic_id);`);

    // ─── REFILL REMINDERS ────────────────────────────────────
    db.execSync(`
      CREATE TABLE IF NOT EXISTS refill_reminders (
        _local_id             TEXT PRIMARY KEY,
        _synced               INTEGER DEFAULT 0,
        _deleted              INTEGER DEFAULT 0,
        _updated_at           TEXT,
        server_id             TEXT UNIQUE,
        clinic_id             TEXT NOT NULL,
        customer_id           TEXT NOT NULL,
        medicine_id           TEXT NOT NULL,
        remind_on             TEXT NOT NULL,
        is_sent               INTEGER DEFAULT 0,
        sent_at               TEXT,
        created_at            TEXT
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_rr_clinic ON refill_reminders(clinic_id);`);

    // ─── SET SCHEMA VERSION ──────────────────────────────────
    db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION};`);

    db.execSync('COMMIT;');
  } catch (error) {
    db.execSync('ROLLBACK;');
    throw error;
  }
}

/**
 * Tables eligible for sync (used by sync engine to iterate).
 */
export const SYNCABLE_TABLES = [
  'suppliers',
  'customers',
  'medicines',
  'medicine_batches',
  'purchases',
  'purchase_items',
  'sales',
  'sale_items',
  'expenses',
  'shortbook',
  'refill_reminders',
] as const;

export type SyncableTable = (typeof SYNCABLE_TABLES)[number];
