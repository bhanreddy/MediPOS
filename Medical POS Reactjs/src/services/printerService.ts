import { db } from '../db/index';
import type { Sale, SaleItem, ShopProfile } from '../core/types';
import { ShopProfileService } from './shopProfileService';
import { printBill } from '../utils/printBill';
import { BILL_PRINT_HALF_PAGE_MAX_ITEMS } from '../components/Billing/BillPrintLayout';

/**
 * PHASE 14: PRINT ENGINE
 * Handles formatting and dispatching print jobs.
 * Supports Thermal Printers (80mm / 58mm).
 * Offline-First: Uses local ShopProfile cache.
 */
export const PrinterService = {

    async printBill(sale: Sale, items: SaleItem[]) {
        try {
            // 1. Fetch Authoritative Header Info (Local Cache) - WITH FALLBACK
            let profile: ShopProfile;
            try {
                profile = await ShopProfileService.getShopProfileLocal();
            } catch (err) {
                console.warn("Print: Shop profile missing, using fallback.");
                profile = {
                    id: '00000000-0000-0000-0000-000000000000',
                    shop_id: 'fallback',
                    medical_name: 'Medical Profile Unavailable',
                    owner_name: 'Unknown',
                    gst_number: 'N/A',
                    drug_license_number: 'N/A',
                    address_line_1: 'Profile data missing from device',
                    city: '-',
                    state: '-',
                    pincode: '-',
                    phone_number: '',
                    verified: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    last_modified: 0,
                    last_fetched_at: new Date().toISOString()
                };
            }

            // 2. Fetch Customer if attached
            const customer = sale.customer_id
                ? await db.customers.get(sale.customer_id)
                : null;

            // 3. Hydrate Items (Fetch Name & Batch Info)
            const enrichedItems = await Promise.all(items.map(async (item) => {
                const product = await db.products.get(item.product_id);
                const batch = await db.batches.get(item.batch_id);

                return {
                    batch: batch!, // Should exist if integrity is maintained
                    productName: product?.name || 'Unknown Product',
                    quantity: item.quantity,
                    unitPrice: item.unit_price,
                    total: item.total_amount,
                    gstRate: item.gst_rate
                };
            }));

            // 4. Trigger Print via Robust Utility
            const customerName = customer?.name;
            const customerPhone = customer?.phone;

            printBill({
                shopProfile: profile,
                customerName,
                customerPhone,
                invoiceNumber: sale.invoice_number,
                date: new Date(sale.created_at).toLocaleString(),
                items: enrichedItems,
                subtotal: sale.total_amount,
                gstAmount: sale.tax_amount,
                discount: sale.discount_amount,
                finalTotal: sale.final_amount,
                printHalfPage: enrichedItems.length <= BILL_PRINT_HALF_PAGE_MAX_ITEMS,
            });

        } catch (error) {
            console.error("Print failed:", error);
            alert("Printing failed. Ensure shop profile is synced.");
        }
    }
}