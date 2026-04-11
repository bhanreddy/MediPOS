import Dexie, { type Table } from 'dexie';
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
    }
}

export const db = new MedicalPOSDatabase();

/**
 * VALIDATION NOTES:
 * 1. BaseEntity: All tables use UUID 'id' and track 'last_modified' for robust offline sync.
 * 2. Relationships: defined via ID references (product_id, batch_id). No ORM-style joins.
 * 3. Inventory: Separated from Batches to allow Location Management and simple quantity mutations without locking immutable Batch metadata.
 * 4. Audit: Separate table to ensure immutability of business tables while tracking history.
 */
