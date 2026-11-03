import { configureStore } from '@reduxjs/toolkit';
import {
    authSlice,
    productSlice,
    inventorySlice,
    customerSlice,
    saleSlice,
    supplierSlice,
    expenseSlice,
    reportSlice,
    uiSlice
} from './slices';

export const store = configureStore({
    reducer: {
        auth: authSlice.reducer,
        products: productSlice.reducer,
        inventory: inventorySlice.reducer,
        customers: customerSlice.reducer,
        sales: saleSlice.reducer,
        suppliers: supplierSlice.reducer,
        expenses: expenseSlice.reducer,
        reports: reportSlice.reducer,
        ui: uiSlice.reducer,
    },
    // Disable devTools in production if needed, enabled for now
    devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
