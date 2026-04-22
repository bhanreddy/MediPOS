import { create } from 'zustand';

/* ─── Types ─────────────────────────────────────────── */

interface Product {
  id: string;
  name: string;
  genericName: string;
  manufacturer: string;
  schedule: string;
}

export interface CartItem {
  product: Product;
  batchId: string;
  qty: number;
  mrp: number;
  discountPct: number;
  gstRate: number;
}

export type PaymentMode = 'cash' | 'upi' | 'card' | 'credit';

interface CartState {
  items: CartItem[];
  customerId: string | null;
  discountPct: number;
  paymentMode: PaymentMode;
}

interface CartActions {
  addItem: (item: CartItem) => void;
  removeItem: (batchId: string) => void;
  updateQty: (batchId: string, qty: number) => void;
  setCustomer: (customerId: string | null) => void;
  setDiscount: (pct: number) => void;
  setPaymentMode: (mode: PaymentMode) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTotal: () => number;
  getGstTotal: () => number;
  getItemCount: () => number;
}

type CartStore = CartState & CartActions;

/* ─── Helpers ───────────────────────────────────────── */

function calcLineTotal(item: CartItem): number {
  const base = item.mrp * item.qty;
  const afterDiscount = base * (1 - item.discountPct / 100);
  return afterDiscount;
}

function calcLineGst(item: CartItem): number {
  const lineTotal = calcLineTotal(item);
  // GST is inclusive in MRP for pharma — extract taxable value
  const taxableValue = lineTotal / (1 + item.gstRate / 100);
  return lineTotal - taxableValue;
}

/* ─── Store ─────────────────────────────────────────── */

const initialState: CartState = {
  items: [],
  customerId: null,
  discountPct: 0,
  paymentMode: 'cash',
};

export const useCartStore = create<CartStore>((set, get) => ({
  ...initialState,

  addItem: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.batchId === item.batchId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.batchId === item.batchId ? { ...i, qty: i.qty + item.qty } : i,
          ),
        };
      }
      return { items: [...state.items, item] };
    }),

  removeItem: (batchId) =>
    set((state) => ({
      items: state.items.filter((i) => i.batchId !== batchId),
    })),

  updateQty: (batchId, qty) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.batchId === batchId ? { ...i, qty: Math.max(0, qty) } : i,
      ),
    })),

  setCustomer: (customerId) => set({ customerId }),

  setDiscount: (pct) => set({ discountPct: Math.min(100, Math.max(0, pct)) }),

  setPaymentMode: (mode) => set({ paymentMode: mode }),

  clearCart: () => set(initialState),

  getSubtotal: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + calcLineTotal(item), 0);
  },

  getDiscountAmount: () => {
    const { items, discountPct } = get();
    const subtotal = items.reduce((sum, item) => sum + calcLineTotal(item), 0);
    return subtotal * (discountPct / 100);
  },

  getTotal: () => {
    const { items, discountPct } = get();
    const subtotal = items.reduce((sum, item) => sum + calcLineTotal(item), 0);
    return subtotal * (1 - discountPct / 100);
  },

  getGstTotal: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + calcLineGst(item), 0);
  },

  getItemCount: () => {
    return get().items.reduce((sum, item) => sum + item.qty, 0);
  },
}));
