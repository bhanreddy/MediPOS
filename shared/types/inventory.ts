export interface Category {
  id: string;
  clinic_id: string;
  name: string;
  created_at: string;
}

export interface Product {
  id: string;
  clinic_id: string;
  category_id?: string | null;
  name: string;
  generic_name?: string | null;
  barcode?: string | null;
  unit: string;
  hsn_code?: string | null;
  gst_rate: number;
  reorder_level: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface InventoryBatch {
  id: string;
  clinic_id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string; // DATE
  quantity: number;
  purchase_price: number; // paise
  selling_price: number; // paise
  created_at: string;
  updated_at: string;
}

export type TransactionType = 'purchase' | 'sale' | 'adjustment' | 'return';

export interface InventoryTransaction {
  id: string;
  clinic_id: string;
  product_id: string;
  batch_id: string;
  type: TransactionType;
  quantity_delta: number;
  invoice_id?: string | null;
  idempotency_key?: string | null;
  notes?: string | null;
  created_at: string;
}
