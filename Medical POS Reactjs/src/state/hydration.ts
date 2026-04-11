import { db } from '../db/index';
import { store } from './store';
import {
    productSlice,
    inventorySlice,
    customerSlice,
    saleSlice,
    supplierSlice,
    expenseSlice,
    uiSlice
} from './slices';
import { BootstrapService } from '../services/bootstrapService';

/**
 * PHASE 3: DB -> REDUX HYDRATION
 * 
 * This layer is the ONLY allowed way to move data from IndexedDB to Redux.
 * Redux does NOT fetch data itself.
 * Components do NOT fetch data itself.
 * 
 * Rule: Hydration is a "Replace World" operation for the specific slice.
 */

export const HydrationService = {
    /**
     * Hydrates ALL core data stores.
     * Call this on App Initialization.
     */
    async hydrateAll() {
        store.dispatch(uiSlice.actions.setLoading(true));
        store.dispatch(uiSlice.actions.setStatus('Hydrating from IndexedDB...'));

        try {
            await BootstrapService.ensureSeed();
            await Promise.all([
                this.hydrateProducts(),
                this.hydrateInventory(),
                this.hydrateCustomers(),
                this.hydrateSales(),
                this.hydrateSuppliers(),
                this.hydrateExpenses()
            ]);
            store.dispatch(uiSlice.actions.setStatus('Ready'));
        } catch (error) {
            console.error('Hydration Failed:', error);
            store.dispatch(uiSlice.actions.setStatus('Hydration Failed'));
        } finally {
            store.dispatch(uiSlice.actions.setLoading(false));
        }
    },

    async hydrateProducts() {
        // Reading FROM Source of Truth
        const products = await db.products.toArray();
        // Writing TO Read Mirror
        store.dispatch(productSlice.actions.hydrateProducts(products));
    },

    async hydrateInventory() {
        const inventory = await db.inventory.toArray();
        store.dispatch(inventorySlice.actions.hydrateInventory(inventory));
    },

    async hydrateCustomers() {
        const customers = await db.customers.toArray();
        store.dispatch(customerSlice.actions.hydrateCustomers(customers));
    },

    async hydrateSales() {
        // For performance, we might limit this query in later phases (e.g., last 50 sales)
        const sales = await db.sales.orderBy('created_at').reverse().limit(100).toArray();
        store.dispatch(saleSlice.actions.hydrateSales(sales));
    },

    async hydrateSuppliers() {
        const suppliers = await db.suppliers.toArray();
        store.dispatch(supplierSlice.actions.hydrateSuppliers(suppliers));
    },

    async hydrateExpenses() {
        const expenses = await db.expenses.orderBy('date').reverse().limit(100).toArray();
        store.dispatch(expenseSlice.actions.hydrateExpenses(expenses));
    }
};
