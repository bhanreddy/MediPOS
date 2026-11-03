import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface PosBatchAllocation {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  allocatedQuantity: number;
  mrp: number;
  purchasePrice: number;
  safetyStatus?: string;
}

export interface PosCartLine {
  id: string; // unique line ID
  medicine_id: string;
  medicine_name: string;
  generic_name?: string | null;
  brand_name?: string | null;
  dosage_form?: string | null;
  strength?: string | null;
  unit_type: string; // BOX, PACK, STRIP, TABLET, etc.
  conversion_factor: number;
  quantity: number;
  base_quantity: number;
  mrp: number;
  unit_price: number;
  discount_pct: number;
  gst_rate: number;
  total: number;
  prescription_required: boolean;
  schedule_classification: string;
  cold_chain_required: boolean;
  manual_batch_id?: string | null;
  batch_allocations: PosBatchAllocation[];
  warnings: Array<{ code: string; message: string; severity: 'INFO' | 'WARNING' | 'BLOCKING' }>;

  // Backwards compatibility fields
  purchase_price?: number;
  batch_id?: string;
  batch_number?: string;
  expiry_date?: string;
  max_stock?: number;
}

export interface PosPaymentTender {
  tender_type: 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'WALLET' | 'LOYALTY';
  amount: number;
  reference_number?: string;
}

interface PosState {
  cart: PosCartLine[];
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  doctor_name: string;
  doctor_registration_number: string;
  prescription_number: string;
  prescription_image_url: string;
  payments: PosPaymentTender[];
  cash_tendered: string; // For cash change calculation
  bill_discount: string;
  is_percentage_discount: boolean;
  coupon_code: string;
  redeem_loyalty_credits: number;
  customer_membership: { type: string; tier: string; loyalty_multiplier: number } | null;
  park_id: string | null;
  park_token: string | null;
  supervisor_auth_id: string | null;

  // Backwards compatibility state & methods
  paid_amount: string;
  payment_mode: 'cash' | 'card' | 'upi' | 'credit' | 'mixed';
  setPaidAmount: (amt: string) => void;
  setPaymentMode: (mode: 'cash' | 'card' | 'upi' | 'credit' | 'mixed') => void;
  setDiscount: (disc: string, isPercentage?: boolean) => void;
  setCouponCode: (code: string) => void;
  setRedeemLoyaltyCredits: (credits: number) => void;
  setCustomerMembership: (mem: { type: string; tier: string; loyalty_multiplier: number } | null) => void;
  updateQuantity: (batchId: string, qty: number, maxStock?: number) => void;
  removeItem: (batchId: string) => void;

  // Cart operations
  addItem: (item: Omit<PosCartLine, 'id' | 'base_quantity' | 'total'>) => void;
  updateLineQuantity: (lineId: string, newQty: number) => void;
  updateLineUnit: (lineId: string, unitType: string, conversionFactor: number) => void;
  updateLineDiscount: (lineId: string, discountPct: number) => void;
  setManualBatch: (lineId: string, batchId: string | null) => void;
  removeLine: (lineId: string) => void;
  clearCart: () => void;

  // Customer & Doctor
  setCustomer: (id: string | null, name: string, phone: string) => void;
  setDoctor: (name: string, regNo?: string) => void;
  setPrescription: (rxNumber: string, imageUrl?: string) => void;

  // Payments
  setPayments: (payments: PosPaymentTender[]) => void;
  setCashTendered: (amount: string) => void;
  setBillDiscount: (discount: string, isPercentage?: boolean) => void;
  setParkedToken: (parkId: string | null, parkToken: string | null) => void;
  setSupervisorAuth: (authId: string | null) => void;

  reset: () => void;
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      cart: [],
      customer_id: null,
      customer_name: '',
      customer_phone: '',
      doctor_name: '',
      doctor_registration_number: '',
      prescription_number: '',
      prescription_image_url: '',
      payments: [{ tender_type: 'CASH', amount: 0 }],
      cash_tendered: '',
      bill_discount: '0',
      is_percentage_discount: false,
      coupon_code: '',
      redeem_loyalty_credits: 0,
      customer_membership: null,
      park_id: null,
      park_token: null,
      supervisor_auth_id: null,
      paid_amount: '',
      payment_mode: 'cash',

      setPaidAmount: (amt) => set({ paid_amount: amt, cash_tendered: amt }),
      setPaymentMode: (mode) =>
        set({
          payment_mode: mode,
          payments: [{ tender_type: mode.toUpperCase() as any, amount: 0 }],
        }),
      setDiscount: (disc, isPct = false) => set({ bill_discount: disc, is_percentage_discount: isPct }),
      setCouponCode: (code) => set({ coupon_code: code }),
      setRedeemLoyaltyCredits: (credits) => set({ redeem_loyalty_credits: credits }),
      setCustomerMembership: (mem) => set({ customer_membership: mem }),
      updateQuantity: (batchId, qty) => {
        const { cart } = get();
        const updated = cart.map((c) =>
          c.id === batchId || c.batch_id === batchId || c.medicine_id === batchId
            ? { ...c, quantity: Math.max(1, qty) }
            : c
        );
        set({ cart: updated });
      },
      removeItem: (batchId) => {
        const { cart } = get();
        set({ cart: cart.filter((c) => c.id !== batchId && c.batch_id !== batchId && c.medicine_id !== batchId) });
      },

      addItem: (item) => {
        const cart = get().cart;
        const lineId = `${item.medicine_id}:${item.unit_type}:${item.manual_batch_id || 'auto'}`;
        const existingIdx = cart.findIndex(l => l.id === lineId);

        const conv = item.conversion_factor || 1.0;
        if (existingIdx >= 0) {
          const existing = cart[existingIdx];
          const newQty = existing.quantity + (item.quantity || 1);
          const baseQty = newQty * conv;
          const effectivePrice = existing.unit_price * (1 - (existing.discount_pct || 0) / 100);
          const total = Math.round(effectivePrice * newQty * 100) / 100;

          const updatedCart = [...cart];
          updatedCart[existingIdx] = {
            ...existing,
            quantity: newQty,
            base_quantity: baseQty,
            total,
          };
          set({ cart: updatedCart });
        } else {
          const qty = item.quantity || 1;
          const baseQty = qty * conv;
          const effectivePrice = item.unit_price * (1 - (item.discount_pct || 0) / 100);
          const total = Math.round(effectivePrice * qty * 100) / 100;

          const newLine: PosCartLine = {
            ...item,
            id: lineId,
            quantity: qty,
            base_quantity: baseQty,
            total,
            batch_allocations: item.batch_allocations || [],
            warnings: item.warnings || [],
          };
          set({ cart: [...cart, newLine] });
        }
      },

      updateLineQuantity: (lineId, newQty) => {
        if (newQty <= 0) {
          get().removeLine(lineId);
          return;
        }
        set({
          cart: get().cart.map(line => {
            if (line.id !== lineId) return line;
            const baseQty = newQty * line.conversion_factor;
            const effectivePrice = line.unit_price * (1 - line.discount_pct / 100);
            const total = Math.round(effectivePrice * newQty * 100) / 100;
            return { ...line, quantity: newQty, base_quantity: baseQty, total };
          }),
        });
      },

      updateLineUnit: (lineId, unitType, conversionFactor) => {
        set({
          cart: get().cart.map(line => {
            if (line.id !== lineId) return line;
            const baseQty = line.quantity * conversionFactor;
            return { ...line, unit_type: unitType, conversion_factor: conversionFactor, base_quantity: baseQty };
          }),
        });
      },

      updateLineDiscount: (lineId, discountPct) => {
        set({
          cart: get().cart.map(line => {
            if (line.id !== lineId) return line;
            const effectivePrice = line.unit_price * (1 - discountPct / 100);
            const total = Math.round(effectivePrice * line.quantity * 100) / 100;
            return { ...line, discount_pct: discountPct, total };
          }),
        });
      },

      setManualBatch: (lineId, batchId) => {
        set({
          cart: get().cart.map(line => (line.id === lineId ? { ...line, manual_batch_id: batchId } : line)),
        });
      },

      removeLine: (lineId) => {
        set({ cart: get().cart.filter(l => l.id !== lineId) });
      },

      clearCart: () => {
        set({
          cart: [],
          payments: [{ tender_type: 'CASH', amount: 0 }],
          cash_tendered: '',
          paid_amount: '',
          payment_mode: 'cash',
          bill_discount: '0',
          park_id: null,
          park_token: null,
          supervisor_auth_id: null,
        });
      },

      setCustomer: (id, name, phone) => {
        set({ customer_id: id, customer_name: name, customer_phone: phone });
      },

      setDoctor: (name, regNo = '') => {
        set({ doctor_name: name, doctor_registration_number: regNo });
      },

      setPrescription: (rxNumber, imageUrl = '') => {
        set({ prescription_number: rxNumber, prescription_image_url: imageUrl });
      },

      setPayments: (payments) => {
        set({ payments });
      },

      setCashTendered: (amount) => {
        set({ cash_tendered: amount });
      },

      setBillDiscount: (discount, isPercentage = false) => {
        set({ bill_discount: discount, is_percentage_discount: isPercentage });
      },

      setParkedToken: (parkId, parkToken) => {
        set({ park_id: parkId, park_token: parkToken });
      },

      setSupervisorAuth: (authId) => {
        set({ supervisor_auth_id: authId });
      },

      reset: () => {
        set({
          cart: [],
          customer_id: null,
          customer_name: '',
          customer_phone: '',
          doctor_name: '',
          doctor_registration_number: '',
          prescription_number: '',
          prescription_image_url: '',
          payments: [{ tender_type: 'CASH', amount: 0 }],
          cash_tendered: '',
          paid_amount: '',
          payment_mode: 'cash',
          bill_discount: '0',
          is_percentage_discount: false,
          coupon_code: '',
          redeem_loyalty_credits: 0,
          park_id: null,
          park_token: null,
          supervisor_auth_id: null,
        });
      },
    }),
    {
      name: 'pos-v2-cart-storage',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
