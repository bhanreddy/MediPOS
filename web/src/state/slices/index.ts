import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Product, Inventory, Customer, Sale, Supplier, Expense } from '../../core/types';
import { authSlice } from './authSlice';

export { reportSlice } from './reportSlice';

export { authSlice };

// --- PRODUCT SLICE ---
interface ProductState {
    items: Product[];
    lastHydrated: number | null;
}
const initialProducts: ProductState = { items: [], lastHydrated: null };
export const productSlice = createSlice({
    name: 'products',
    initialState: initialProducts,
    reducers: {
        hydrateProducts: (state, action: PayloadAction<Product[]>) => {
            state.items = action.payload;
            state.lastHydrated = Date.now();
        },
    },
});

// --- INVENTORY SLICE ---
interface InventoryState {
    items: Inventory[];
    lastHydrated: number | null;
}
const initialInventory: InventoryState = { items: [], lastHydrated: null };
export const inventorySlice = createSlice({
    name: 'inventory',
    initialState: initialInventory,
    reducers: {
        hydrateInventory: (state, action: PayloadAction<Inventory[]>) => {
            state.items = action.payload;
            state.lastHydrated = Date.now();
        },
    },
});

// --- CUSTOMER SLICE ---
interface CustomerState {
    items: Customer[];
    lastHydrated: number | null;
}
const initialCustomers: CustomerState = { items: [], lastHydrated: null };
export const customerSlice = createSlice({
    name: 'customers',
    initialState: initialCustomers,
    reducers: {
        hydrateCustomers: (state, action: PayloadAction<Customer[]>) => {
            state.items = action.payload;
            state.lastHydrated = Date.now();
        },
    },
});

// --- SALES SLICE ---
interface SaleState {
    recentSales: Sale[]; // We might not load ALL sales into memory
    lastHydrated: number | null;
}
const initialSales: SaleState = { recentSales: [], lastHydrated: null };
export const saleSlice = createSlice({
    name: 'sales',
    initialState: initialSales,
    reducers: {
        hydrateSales: (state, action: PayloadAction<Sale[]>) => {
            state.recentSales = action.payload;
            state.lastHydrated = Date.now();
        },
    },
});

// --- SUPPLIER SLICE ---
interface SupplierState {
    items: Supplier[];
    lastHydrated: number | null;
}
const initialSuppliers: SupplierState = { items: [], lastHydrated: null };
export const supplierSlice = createSlice({
    name: 'suppliers',
    initialState: initialSuppliers,
    reducers: {
        hydrateSuppliers: (state, action: PayloadAction<Supplier[]>) => {
            state.items = action.payload;
            state.lastHydrated = Date.now();
        },
    },
});

// --- EXPENSE SLICE ---
interface ExpenseState {
    recentExpenses: Expense[];
    lastHydrated: number | null;
}
const initialExpenses: ExpenseState = { recentExpenses: [], lastHydrated: null };
export const expenseSlice = createSlice({
    name: 'expenses',
    initialState: initialExpenses,
    reducers: {
        hydrateExpenses: (state, action: PayloadAction<Expense[]>) => {
            state.recentExpenses = action.payload;
            state.lastHydrated = Date.now();
        },
    },
});

// --- UI SLICE ---
interface UIState {
    isLoading: boolean;
    statusMessage: string;
    alertExpiryCount: number;
    alertLowStockCount: number;
    lastAlertToastAt: number;
}
const initialUI: UIState = {
    isLoading: false,
    statusMessage: 'Idle',
    alertExpiryCount: 0,
    alertLowStockCount: 0,
    lastAlertToastAt: 0,
};
export const uiSlice = createSlice({
    name: 'ui',
    initialState: initialUI,
    reducers: {
        setLoading: (state, action: PayloadAction<boolean>) => {
            state.isLoading = action.payload;
        },
        setStatus: (state, action: PayloadAction<string>) => {
            state.statusMessage = action.payload;
        },
        setStockAlerts: (state, action: PayloadAction<{ expiry: number; lowStock: number }>) => {
            state.alertExpiryCount = action.payload.expiry;
            state.alertLowStockCount = action.payload.lowStock;
        },
        markAlertToast: (state, action: PayloadAction<number>) => {
            state.lastAlertToastAt = action.payload;
        },
    },
});
