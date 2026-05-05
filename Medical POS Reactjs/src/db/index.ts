import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import type {
    User,
    Role,
    Product,
    Batch,
    Inventory,
    Customer,
    Supplier,
    Sale,
    SaleItem,
    Purchase,
    Expense,
    AuditLog,
    AppSetting,
    SyncQueueItem,
    AuthSession,
    ShopProfile,
    PurchaseOrder,
    SupplierLedgerEntry,
    PurchaseReturn,
    PurchaseReturnLine
} from '../core/types';

/** Sync metadata key-value store (e.g., last_pulled_at). */
export interface SyncMeta {
    key: string;
    value: string;
}

export class MedicalPOSDatabase extends Dexie {
    users!: Table<User>;
    roles!: Table<Role>;
    auth_sessions!: Table<AuthSession>;
    products!: Table<Product>;
    batches!: Table<Batch>;
    inventory!: Table<Inventory>;
    customers!: Table<Customer>;
    suppliers!: Table<Supplier>;
    sales!: Table<Sale>;
    sale_items!: Table<SaleItem>;
    purchases!: Table<Purchase>;
    expenses!: Table<Expense>;
    audit_logs!: Table<AuditLog>;
    app_settings!: Table<AppSetting>;
    sync_queue!: Table<SyncQueueItem>;
    shop_profile!: Table<ShopProfile>;
    purchase_orders!: Table<PurchaseOrder>;
    supplier_ledger_entries!: Table<SupplierLedgerEntry>;
    purchase_returns!: Table<PurchaseReturn>;
    purchase_return_lines!: Table<PurchaseReturnLine>;
    sync_meta!: Table<SyncMeta>;

    constructor() {
        super('MedicalPOS_DB');

        // Schema Version 1
        // Rule: 'id' is primary key (UUID)
        // Rule: Identify commonly queried fields for indexing
        this.version(1).stores({
            users: 'id, username, role_id, is_active',
            roles: 'id, name',
            auth_sessions: 'id, user_id, expires_at',

            // Products: Index on name for search, manufacturer, type. Barcode if present.
            products: 'id, name, type, manufacturer, barcode, is_active, last_modified',

            // Batches: Index on product_id (relationship), expiry (FEFO), batch_number.
            batches: 'id, product_id, purchase_id, batch_number, expiry_date, last_modified',

            // Inventory: query by batch_id or location.
            inventory: 'id, batch_id, location, last_modified',

            // Consumers
            customers: 'id, phone, name, last_modified',
            suppliers: 'id, name, gstin, is_active, last_modified',

            // Transactions
            sales: 'id, invoice_number, customer_id, user_id, created_at, status, last_modified',
            sale_items: 'id, sale_id, product_id, batch_id', // frequently queried by sale_id

            // Inbound
            purchases: 'id, invoice_number, supplier_id, invoice_date, status, last_modified',

            // Ops
            expenses: 'id, category, date, user_id, last_modified',

            // System
            audit_logs: 'id, table_name, record_id, action, created_at, user_id',
            app_settings: 'id, key, group',

            // Sync
            sync_queue: 'id, table_name, status, created_at',

            // Identity Cache
            shop_profile: 'id, medical_name, phone_number, shop_id'
        });

        this.version(2).stores({
            users: 'id, username, role_id, is_active',
            roles: 'id, name',
            auth_sessions: 'id, user_id, expires_at',
            products: 'id, name, type, manufacturer, barcode, is_active, last_modified',
            batches: 'id, product_id, purchase_id, batch_number, expiry_date, last_modified',
            inventory: 'id, batch_id, location, last_modified',
            customers: 'id, phone, name, last_modified',
            suppliers: 'id, name, gstin, is_active, last_modified',
            sales: 'id, invoice_number, customer_id, user_id, created_at, status, last_modified',
            sale_items: 'id, sale_id, product_id, batch_id',
            purchases: 'id, invoice_number, supplier_id, invoice_date, status, last_modified',
            expenses: 'id, category, date, user_id, last_modified',
            audit_logs: 'id, table_name, record_id, action, created_at, user_id',
            app_settings: 'id, key, group',
            sync_queue: 'id, table_name, status, created_at',
            shop_profile: 'id, medical_name, phone_number, shop_id',
            purchase_orders: 'id, supplier_id, po_number, status, order_date, last_modified',
            supplier_ledger_entries: 'id, supplier_id, entry_type, entry_date, last_modified',
            purchase_returns: 'id, supplier_id, return_date, status, last_modified',
            purchase_return_lines: 'id, return_id, batch_id, last_modified'
        });

        // ── Version 3: Offline-First Sync Columns ──
        // Adds _local_id, _synced, _deleted, _updated_at, server_id to all tables
        // Adds sync_meta table for last_pulled_at tracking
        this.version(3).stores({
            users: 'id, _local_id, username, role_id, is_active, _synced, _deleted, server_id',
            roles: 'id, name',
            auth_sessions: 'id, user_id, expires_at',
            products: 'id, _local_id, name, type, manufacturer, barcode, is_active, _synced, _deleted, server_id',
            batches: 'id, _local_id, product_id, purchase_id, batch_number, expiry_date, _synced, _deleted, server_id',
            inventory: 'id, _local_id, batch_id, location, _synced, _deleted, server_id',
            customers: 'id, _local_id, phone, name, _synced, _deleted, server_id',
            suppliers: 'id, _local_id, name, gstin, is_active, _synced, _deleted, server_id',
            sales: 'id, _local_id, invoice_number, customer_id, user_id, created_at, status, _synced, _deleted, server_id',
            sale_items: 'id, _local_id, sale_id, product_id, batch_id, _synced, _deleted, server_id',
            purchases: 'id, _local_id, invoice_number, supplier_id, invoice_date, status, _synced, _deleted, server_id',
            expenses: 'id, _local_id, category, date, user_id, _synced, _deleted, server_id',
            audit_logs: 'id, table_name, record_id, action, created_at, user_id',
            app_settings: 'id, key, group',
            sync_queue: 'id, table_name, status, created_at, operation',
            shop_profile: 'id, medical_name, phone_number, shop_id',
            purchase_orders: 'id, _local_id, supplier_id, po_number, status, order_date, _synced, _deleted, server_id',
            supplier_ledger_entries: 'id, _local_id, supplier_id, entry_type, entry_date, _synced, _deleted, server_id',
            purchase_returns: 'id, _local_id, supplier_id, return_date, status, _synced, _deleted, server_id',
            purchase_return_lines: 'id, _local_id, return_id, batch_id, _synced, _deleted, server_id',
            // NEW: Sync metadata (last_pulled_at, etc.)
            sync_meta: 'key'
        }).upgrade(tx => {
            // Populate _local_id, _synced, _deleted, _updated_at for existing records
            const tablesToMigrate = [
                'users', 'products', 'batches', 'inventory', 'customers',
                'suppliers', 'sales', 'sale_items', 'purchases', 'expenses',
                'purchase_orders', 'supplier_ledger_entries', 'purchase_returns',
                'purchase_return_lines'
            ];

            const promises = tablesToMigrate.map(tableName =>
                (tx as any).table(tableName).toCollection().modify((record: any) => {
                    if (!record._local_id) {
                        record._local_id = record.id; // Use existing id as _local_id
                    }
                    if (record._synced === undefined) {
                        record._synced = 1; // Existing data is considered synced
                    }
                    if (record._deleted === undefined) {
                        record._deleted = 0;
                    }
                    if (!record._updated_at) {
                        record._updated_at = record.updated_at || new Date().toISOString();
                    }
                })
            );

            return Promise.all(promises);
        });

        this.setupHooks();
    }

    private setupHooks() {
        const syncableTables = [
            'products', 'batches', 'inventory', 'customers',
            'suppliers', 'sales', 'sale_items', 'purchases', 'expenses',
            'purchase_orders', 'supplier_ledger_entries', 'purchase_returns',
            'purchase_return_lines'
        ];

        for (const tableName of syncableTables) {
            const table = (this as any)[tableName] as Table<any>;

            // ── INSERT HOOK ──
            table.hook('creating', function (_primKey, obj, trans) {
                if (obj._synced === 1) return; // Skip if from sync engine

                obj._local_id = obj.id || uuidv4();
                obj.id = obj._local_id;
                obj._synced = 0;
                obj._deleted = 0;
                obj._updated_at = new Date().toISOString();

                const queueItem = {
                    id: uuidv4(),
                    table_name: tableName,
                    record_id: obj._local_id,
                    operation: 'INSERT',
                    payload: JSON.stringify(obj),
                    retry_count: 0,
                    created_at: new Date().toISOString(),
                    status: 'pending'
                };
                trans.table('sync_queue').add(queueItem);
            });

            // ── UPDATE HOOK ──
            table.hook('updating', function (modifications, primKey, obj, trans) {
                // If the modification explicitly sets _synced to 1, it's from the sync engine
                if ((modifications as any)._synced === 1) return undefined;

                const timestamp = new Date().toISOString();
                const merged = { ...obj, ...modifications };

                // Force local changes to be marked as unsynced
                const enforcedMods = {
                    _synced: 0,
                    _updated_at: timestamp
                };
                Object.assign(merged, enforcedMods);

                const isSoftDelete = merged._deleted === 1;

                const queueItem = {
                    id: uuidv4(),
                    table_name: tableName,
                    record_id: String(primKey),
                    operation: isSoftDelete ? 'DELETE' : 'UPDATE',
                    payload: JSON.stringify(merged),
                    retry_count: 0,
                    created_at: timestamp,
                    status: 'pending'
                };
                trans.table('sync_queue').add(queueItem);

                return enforcedMods;
            });

            // ── DELETE HOOK ──
            table.hook('deleting', function (primKey, obj, trans) {
                if (obj._synced === 1 && obj._deleted === 1) return;

                const timestamp = new Date().toISOString();
                const queueItem = {
                    id: uuidv4(),
                    table_name: tableName,
                    record_id: String(primKey),
                    operation: 'DELETE',
                    payload: JSON.stringify(obj),
                    retry_count: 0,
                    created_at: timestamp,
                    status: 'pending'
                };
                trans.table('sync_queue').add(queueItem);
            });
        }
    }
}

export const db = new MedicalPOSDatabase();

/**
 * VALIDATION NOTES:
 * 1. BaseEntity: All tables use UUID 'id' and track 'last_modified' for robust offline sync.
 * 2. Relationships: defined via ID references (product_id, batch_id). No ORM-style joins.
 * 3. Inventory: Separated from Batches to allow Location Management and simple quantity mutations without locking immutable Batch metadata.
 * 4. Audit: Separate table to ensure immutability of business tables while tracking history.
 * 5. Version 3: Added offline-first sync columns (_local_id, _synced, _deleted, _updated_at, server_id)
 *    to all mutable tables. sync_meta table tracks pull timestamps.
 */

