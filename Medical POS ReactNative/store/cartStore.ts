import { create } from 'zustand';

export interface CartItem {
  medicine_id: string;
  medicine_name: string;
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  mrp: number;
  discount_pct: number;
  gst_rate: number;
  available_stock: number;
}

interface CartStore {
  items: CartItem[];
  bill_discount: number;
  customer_id: string | null;
  payment_mode: 'cash' | 'upi' | 'card' | 'credit';
  payment_status: 'paid' | 'partial' | 'credit';
  paid_amount: number;

  // Actions
  addItem: (item: CartItem) => void;
  removeItem: (medicine_id: string, batch_id: string) => void;
  updateQuantity: (medicine_id: string, batch_id: string, qty: number) => void;
  setDiscount: (amount: number) => void;
  setCustomer: (id: string | null) => void;
  setPayment: (mode: 'cash' | 'upi' | 'card' | 'credit', status: 'paid' | 'partial' | 'credit', paid_amount: number) => void;
  clearCart: () => void;

  // Computed (getters as separate utility or simple functions since zustand state variables are primarily static)
  getSubtotal: () => number;
  getGstAmount: () => number;
  getNetAmount: () => number;
  getBalanceDue: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  bill_discount: 0,
  customer_id: null,
  payment_mode: 'cash',
  payment_status: 'paid',
  paid_amount: 0,

  addItem: (item) => set((state) => {
    const existing = state.items.find(i => i.medicine_id === item.medicine_id && i.batch_id === item.batch_id);
    if (existing) {
      if (existing.quantity + item.quantity > existing.available_stock) return state; // ignore if over stock
      return { 
        items: state.items.map(i => 
          (i.medicine_id === item.medicine_id && i.batch_id === item.batch_id) 
            ? { ...i, quantity: i.quantity + item.quantity } 
            : i
        ) 
      };
    }
    return { items: [...state.items, item] };
  }),

  removeItem: (medicine_id, batch_id) => set((state) => ({
    items: state.items.filter(i => !(i.medicine_id === medicine_id && i.batch_id === batch_id))
  })),

  updateQuantity: (medicine_id, batch_id, qty) => set((state) => {
    return {
      items: state.items.map(i => {
        if (i.medicine_id === medicine_id && i.batch_id === batch_id) {
          const newQty = Math.max(1, Math.min(qty, i.available_stock));
          return { ...i, quantity: newQty };
        }
        return i;
      })
    };
  }),

  setDiscount: (amount) => set({ bill_discount: amount }),
  setCustomer: (id) => set({ customer_id: id }),
  setPayment: (mode, status, paid_amount) => set({ payment_mode: mode, payment_status: status, paid_amount }),

  clearCart: () => set({
    items: [],
    bill_discount: 0,
    customer_id: null,
    payment_mode: 'cash',
    payment_status: 'paid',
    paid_amount: 0
  }),

  getSubtotal: () => {
    return get().items.reduce((sum, item) => sum + (item.quantity * item.mrp * (1 - item.discount_pct / 100)), 0);
  },
  
  getGstAmount: () => {
    return get().items.reduce((sum, item) => sum + (item.quantity * item.mrp * (item.gst_rate / 100)), 0);
  },
  
  getNetAmount: () => {
    const st = get().getSubtotal();
    const gst = get().getGstAmount();
    return st - get().bill_discount + gst;
  },

  getBalanceDue: () => {
    const net = get().getNetAmount();
    return Math.max(0, net - get().paid_amount);
  }
}));
