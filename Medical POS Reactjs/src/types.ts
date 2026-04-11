export type UUID = string; // Supabase UUID
export type ISODateString = string; // YYYY-MM-DD
export type ISODateTimeString = string; // YYYY-MM-DDTHH:mm:ss.sssZ

export const SyncStatus = {
    Synced: 'SYNCED',
    Pending: 'PENDING',
    Failed: 'FAILED',
} as const;
export type SyncStatus = typeof SyncStatus[keyof typeof SyncStatus];

export interface BaseEntity {
    id: UUID; // Client-generated UUID v4
    created_at: ISODateTimeString;
    updated_at: ISODateTimeString;
    sync_status: SyncStatus; // For Supabase sync
}

export interface Product extends BaseEntity {
    name: string;
    composition: string; // Generic name/salt
    manufacturer: string;
    category: string; // e.g., "Tablet", "Syrup", "Equipment"
    hsn_code: string;
    gst_rate: number; // e.g., 5, 12, 18
    description?: string;
    min_stock_alert: number;
}

export interface Batch extends BaseEntity {
    product_id: UUID;
    batch_number: string;
    expiry_date: ISODateString;
    mrp: number; // Maximum Retail Price
    purchase_rate: number;
    quantity: number; // Current stock level
    location?: string; // Rack/Shelf
    supplier_id?: UUID;
}

export interface Customer extends BaseEntity {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    notes?: string;
}

export interface Supplier extends BaseEntity {
    name: string;
    contact_person: string;
    phone: string;
    email?: string;
    gstin: string;
    address: string;
}

export const AuditAction = {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    SYNC: 'SYNC',
} as const;
export type AuditAction = typeof AuditAction[keyof typeof AuditAction];

export interface AuditLog {
    id: string; // UUID
    entity_type: string; // 'Product', 'Sale', etc.
    entity_id: string;
    action: AuditAction;
    timestamp: string;
    user_id?: string; // If auth is present
    metadata?: any; // JSON object for details (e.g. diff)
}

export const PaymentMode = {
    Cash: 'CASH',
    UPI: 'UPI',
    Card: 'CARD',
    Due: 'DUE',
} as const;
export type PaymentMode = typeof PaymentMode[keyof typeof PaymentMode];

export interface Sale extends BaseEntity {
    invoice_number: string; // Auto-increment or Format (e.g., INV-2023-001)
    customer_id?: UUID; // Optional for walk-ins
    customer_name?: string; // Snapshot for walk-ins
    total_amount: number;
    discount_amount: number;
    tax_amount: number;
    final_amount: number;
    payment_mode: PaymentMode;
    is_paid: boolean;
    notes?: string;
}

export interface SaleItem extends BaseEntity {
    sale_id: UUID;
    product_id: UUID;
    batch_id: UUID;
    quantity: number;
    mrp: number; // Snapshot at time of sale
    rate: number; // Selling Price (usually MRP)
    discount_percent: number;
    tax_percent: number; // Snapshot
    total: number;
}

export interface Expense extends BaseEntity {
    category: string; // Rent, Electricity, Salaries
    amount: number;
    date: ISODateString;
    description: string;
    payment_mode: PaymentMode;
}

export interface SubscriptionPlan {
    id: UUID;
    name: string;
    display_name: string;
    price_monthly: number;
    price_annual: number;
    features: any;
    limits: any;
    is_active: boolean;
}

export interface ClinicSubscription {
    id: UUID;
    clinic_id: UUID;
    plan_name: string;
    status: string;
    billing_cycle: string;
    current_period_start?: string;
    current_period_end?: string;
    trial_end?: string;
    cancelled_at?: string;
}
