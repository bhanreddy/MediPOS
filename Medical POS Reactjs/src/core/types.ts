export type UUID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // ISO 8601

// Common interface for ALL mutable tables
export interface BaseEntity {
    id: UUID;                // Also serves as _local_id (client-generated UUID)
    created_at: ISODateTime;
    updated_at: ISODateTime;
    last_modified: number;   // Legacy — kept for backward compat
    // ── Offline-First Sync Columns ──
    _local_id?: UUID;         // Client-generated UUID, primary key for local ops
    _synced?: 0 | 1;          // 0 = unsynced, 1 = synced
    _deleted?: 0 | 1;         // Soft-delete flag (NEVER hard delete)
    _updated_at?: ISODateTime; // ISO timestamp of last local mutation
    server_id?: UUID | null;  // Server-side UUID (from Supabase)
}

// 1. users
export interface User extends BaseEntity {
    username: string;
    password_hash: string; // SHA-256 of the password for Offline Auth
    role_id: UUID;
    name: string;
    is_active: boolean;
}

// 2. roles
export interface Role extends BaseEntity {
    name: string;
    permissions: string[]; // Serialized JSON array of permission strings
}

// AUTH SESSION (For Offline/Hybrid Session)
export interface AuthSession extends BaseEntity {
    user_id: UUID;
    role_id: UUID;
    permissions: string[];
    expires_at: number; // Timestamp
    is_offline_session: boolean;
    token?: string; // Supabase token if online
}

// 3. products
export interface Product extends BaseEntity {
    name: string;
    composition: string;
    manufacturer: string;
    type: string; // e.g., 'TABLET', 'SYRUP'
    /** Therapeutic / shelf category for reporting (e.g. Antibiotic, OTC) */
    category?: string;
    /** Schedule H — prescription mandatory at billing */
    schedule_h?: boolean;
    hsn_code: string;
    gst_rate: number;
    min_stock_alert: number;
    barcode?: string;
    is_active: boolean;
}

// 4. batches
export interface Batch extends BaseEntity {
    product_id: UUID;
    purchase_id: UUID; // Link to inward supply
    batch_number: string;
    expiry_date: ISODate; // Critical for FEFO
    mrp: number;
    purchase_rate: number;
    sales_rate: number;
    barcode?: string; // Optional batch-specific barcode
}

// 5. inventory
// Represents current physical stock at a location for a specific batch.
export interface Inventory extends BaseEntity {
    batch_id: UUID;
    quantity: number;
    location: string; // e.g., 'RACK-1'
}

// 6. customers
export interface Customer extends BaseEntity {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    /** State code / name for IGST determination at billing */
    state?: string;
    /** Optional credit limit in INR for due tracking */
    credit_limit?: number;
    /** Running due balance (increased on DUE sales, reduced on receipts) */
    credit_balance?: number;
}

// 7. suppliers
export interface Supplier extends BaseEntity {
    name: string;
    gstin: string;
    phone: string;
    email?: string;
    address: string;
    is_active: boolean;
}

export type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'DUE' | 'MIXED';

export interface SalePaymentSplit {
    mode: 'CASH' | 'UPI' | 'CARD' | 'DUE';
    amount: number;
}

// 8. sales
export interface Sale extends BaseEntity {
    invoice_number: string;
    customer_id?: UUID; // Optional for walk-ins
    user_id: UUID; // Cashier
    total_amount: number;
    discount_amount: number;
    tax_amount: number;
    final_amount: number;
    payment_mode: PaymentMode;
    /** Serialized JSON array when payment_mode === MIXED */
    payment_splits_json?: string;
    /** INTRA = CGST+SGST, INTER = IGST */
    supply_type?: 'INTRA' | 'INTER';
    gst_cgst_total?: number;
    gst_sgst_total?: number;
    gst_igst_total?: number;
    /** Prescription reference for Schedule H lines */
    prescription_rx_number?: string;
    /** Data URL or stored reference string for prescription image */
    prescription_image_data?: string;
    status: 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
}

// 9. sale_items
export interface SaleItem extends BaseEntity {
    sale_id: UUID;
    product_id: UUID;
    batch_id: UUID;
    quantity: number;
    unit_price: number;
    mrp: number; // Snapshot of MRP at time of sale
    gst_rate: number; // Snapshot of GST Rate
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
}

// 10. purchases
export interface Purchase extends BaseEntity {
    supplier_id: UUID;
    invoice_number: string;
    invoice_date: ISODate;
    received_date: ISODate;
    total_amount: number;
    tax_amount: number;
    status: 'PENDING' | 'COMPLETED';
}

// 11. expenses
export interface Expense extends BaseEntity {
    category: string;
    description: string;
    amount: number;
    payment_mode: 'CASH' | 'UPI' | 'CARD' | 'DUE';
    date: ISODate;
    user_id: UUID;
}

// 12. audit_logs
export interface AuditLog extends BaseEntity {
    table_name: string;
    record_id: UUID;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    old_value?: string; // JSON
    new_value?: string; // JSON
    user_id: UUID;
}

// 13. app_settings
export interface AppSetting extends BaseEntity {
    key: string;
    value: string;
    group: string;
}

// 14. sync_queue (offline-first mutation queue)
export interface SyncQueueItem {
    id: UUID;                // Queue entry ID
    table_name: string;
    record_id: UUID;         // _local_id of the mutated record
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    payload: string;         // JSON stringified row data
    retry_count: number;
    created_at: ISODateTime;
    status: 'pending' | 'failed' | 'done' | 'manual_review';
}

// 15. shop_profile (Local Cache of Online Identity)
// 15. shop_profile (Local Cache of Online Identity)
export interface ShopProfile extends BaseEntity {
    shop_id: string; // Supabase ID (medical_profile.id)
    medical_name: string;
    owner_name: string;

    // Legal (Read Only)
    gst_number: string;
    drug_license_number: string;

    // Address (Read Only)
    address_line_1: string;
    address_line_2?: string;
    city: string;
    state: string;
    pincode: string;

    // Branding & Contact
    logo_url?: string;
    phone_number: string; // Editable

    verified: boolean;
    last_fetched_at: ISODateTime;
}

// --- REPORT TYPES ---

export interface SalesReportSummary {
    startDate: ISODate;
    endDate: ISODate;
    totalBills: number;
    totalAmount: number;
    totalDiscount: number;
    totalTax: number;
    netAmount: number;
    paymentModeBreakdown: Record<string, number>; // 'CASH': 1000, 'UPI': 500
}

export interface TaxReportItem {
    gstRate: number;
    taxableAmount: number;
    taxAmount: number; // Total Tax
    cgst: number;
    sgst: number;
    igst: number;
}

export interface TaxReport {
    startDate: ISODate;
    endDate: ISODate;
    totalTaxable: number;
    totalTax: number;
    breakdown: TaxReportItem[];
}

export interface StockValueReport {
    totalItems: number; // Unique Products
    totalBatches: number;
    totalQuantity: number;
    totalPurchaseValue: number; // Cost
    totalSalesValue: number; // MRP
}

export interface ExpiryReportItem {
    batchId: UUID;
    productName: string;
    batchNumber: string;
    expiryDate: ISODate;
    quantity: number;
    daysToExpiry: number;
}

export interface ProfitReport {
    startDate: ISODate;
    endDate: ISODate;
    totalRevenue: number;
    totalCostOfGoodsSold: number;
    grossProfit: number;
    marginPercent: number;
}

// --- SUPPLIER OPS ---

export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'CLOSED' | 'CANCELLED';

export interface PurchaseOrderLine {
    product_id: UUID;
    product_name: string;
    qty_ordered: number;
    qty_received: number;
    expected_rate?: number;
}

export interface PurchaseOrder extends BaseEntity {
    supplier_id: UUID;
    po_number: string;
    status: PurchaseOrderStatus;
    order_date: ISODate;
    expected_date?: ISODate;
    notes?: string;
    lines_json: string;
}

export type SupplierLedgerEntryType = 'PURCHASE' | 'PAYMENT' | 'RETURN' | 'ADJUSTMENT';

/** Running supplier account (payable positive = we owe supplier) */
export interface SupplierLedgerEntry extends BaseEntity {
    supplier_id: UUID;
    entry_type: SupplierLedgerEntryType;
    /** Links to purchase, PO, return, or manual id */
    reference_id?: UUID;
    description: string;
    /** Increases amount payable to supplier */
    debit: number;
    /** Decreases payable (payment to supplier) */
    credit: number;
    entry_date: ISODate;
}

export type PurchaseReturnStatus = 'DRAFT' | 'POSTED';

export interface PurchaseReturn extends BaseEntity {
    supplier_id: UUID;
    return_date: ISODate;
    reference_note: string;
    status: PurchaseReturnStatus;
    total_value: number;
}

export interface PurchaseReturnLine extends BaseEntity {
    return_id: UUID;
    batch_id: UUID;
    product_id: UUID;
    quantity: number;
    rate: number;
}

// --- ROLE NAMES (seed) ---
export type RoleName = 'ADMIN' | 'MANAGER' | 'CASHIER';
