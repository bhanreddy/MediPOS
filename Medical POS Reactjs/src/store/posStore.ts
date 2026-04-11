import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartItem {
    medicine_id: string;
    medicine_name: string;
    batch_id: string;
    batch_number: string;
    expiry_date: string;
    quantity: number;
    mrp: number;
    purchase_price: number;
    max_stock: number;
    gst_rate: number;
    discount_pct: number;
}

interface PosState {
    cart: CartItem[];
    customer_id: string | null;
    customer_name: string;
    customer_phone: string;
    payment_mode: 'cash' | 'upi' | 'card' | 'credit';
    paid_amount: string; // string so users can type empty or decimals freely before parse
    bill_discount: string;
    is_percentage_discount: boolean;
    
    addItem: (item: CartItem) => void;
    updateQuantity: (batch_id: string, newQty: number) => void;
    removeItem: (batch_id: string) => void;
    clearCart: () => void;
    
    setCustomer: (id: string | null, name: string, phone: string) => void;
    setPaymentMode: (mode: 'cash' | 'upi' | 'card' | 'credit') => void;
    setPaidAmount: (amount: string) => void;
    setDiscount: (value: string, isPercentage: boolean) => void;
    
    reset: () => void;
}

export const usePosStore = create<PosState>()(
    persist(
        (set, get) => ({
            cart: [],
            customer_id: null,
            customer_name: '',
            customer_phone: '',
            payment_mode: 'cash',
            paid_amount: '',
            bill_discount: '0',
            is_percentage_discount: false,

            addItem: (item) => {
                const cart = get().cart;
                const existing = cart.find(i => i.batch_id === item.batch_id);
                if (existing) {
                    const newQty = Math.min(existing.quantity + 1, existing.max_stock);
                    set({ cart: cart.map(i => i.batch_id === item.batch_id ? { ...i, quantity: newQty } : i) });
                } else {
                    set({ cart: [...cart, item] });
                }
            },

            updateQuantity: (batch_id, newQty) => {
                set({ cart: get().cart.map(i => i.batch_id === batch_id ? { ...i, quantity: newQty } : i) });
            },

            removeItem: (batch_id) => {
                set({ cart: get().cart.filter(i => i.batch_id !== batch_id) });
            },

            clearCart: () => set({ cart: [] }),
            
            setCustomer: (id, name, phone) => set({ customer_id: id, customer_name: name, customer_phone: phone }),
            setPaymentMode: (mode) => set({ payment_mode: mode }),
            setPaidAmount: (amount) => set({ paid_amount: amount }),
            setDiscount: (value, isPercent) => set({ bill_discount: value, is_percentage_discount: isPercent }),

            reset: () => set({
                cart: [],
                customer_id: null,
                customer_name: '',
                customer_phone: '',
                payment_mode: 'cash',
                paid_amount: '',
                bill_discount: '0',
                is_percentage_discount: false
            })
        }),
        {
            name: 'pos-cart-storage',
            storage: createJSONStorage(() => sessionStorage), 
        }
    )
);
