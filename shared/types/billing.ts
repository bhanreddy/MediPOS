export type InvoiceStatus = 'draft' | 'confirmed' | 'cancelled';
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'credit';
export type PaymentStatus = 'pending' | 'paid' | 'partial';

export interface Invoice {
  id: string;
  clinic_id: string;
  patient_id?: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  subtotal: number; // paise
  discount: number; // paise
  gst_amount: number; // paise
  total: number; // paise
  payment_method?: PaymentMethod | null;
  payment_status: PaymentStatus;
  idempotency_key?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface InvoiceItem {
  id: string;
  clinic_id: string;
  invoice_id: string;
  product_id: string;
  batch_id: string;
  quantity: number;
  unit_price: number; // paise
  discount: number; // paise
  gst_rate: number;
  gst_amount: number; // paise
  total: number; // paise
  created_at: string;
}

export interface Prescription {
  id: string;
  clinic_id: string;
  patient_id: string;
  doctor_name?: string | null;
  notes?: string | null;
  invoice_id?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}
