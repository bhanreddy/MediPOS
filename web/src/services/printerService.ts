import api from '../lib/api';
import type { Sale, SaleItem, ShopProfile } from '../core/types';
import { ShopProfileService } from './shopProfileService';
import { printBill } from '../utils/printBill';

/**
 * PHASE 14: PRINT ENGINE
 * Handles formatting and dispatching print jobs.
 * Supports Thermal Printers (80mm / 58mm).
 * Online-First: Uses ShopProfile Service.
 */
export const PrinterService = {

    async printBill(sale: Sale, items: SaleItem[]) {
        try {
            const saleData = sale as any;
            const toNumber = (value: unknown, fallback = 0) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? parsed : fallback;
            };

            const priceIncludesTax = saleData.price_includes_tax === true;
            const subtotal = toNumber(saleData.subtotal ?? saleData.total_amount);
            const gstAmount = toNumber(saleData.gst_amount ?? saleData.tax_amount);
            const discount = toNumber(saleData.discount ?? saleData.discount_amount);
            const finalTotal = toNumber(
                saleData.net_amount ?? saleData.grand_total ?? saleData.final_amount,
                Math.max(0, subtotal - discount + (priceIncludesTax ? 0 : gstAmount)),
            );
            const optionalNumber = (value: unknown) => value === null || value === undefined || value === ''
                ? undefined : Number.isFinite(Number(value)) ? Number(value) : undefined;
            const paidAmount = optionalNumber(saleData.paid_amount);
            const balanceDue = optionalNumber(saleData.balance_due) ?? (paidAmount === undefined ? undefined
                : Math.max(0, Math.round((finalTotal - paidAmount) * 100) / 100));
            const paymentModes: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', DUE: 'Credit', CREDIT: 'Credit', MIXED: 'Split payment' };
            const paymentMode = String(saleData.payment_mode || saleData.payment_method || '').toUpperCase();
            const createdAt = saleData.created_at ? new Date(saleData.created_at) : new Date();
            const invoiceDate = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;

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
            let customerName = saleData.customers?.name;
            let customerPhone = saleData.customers?.phone;
            if (sale.customer_id && !customerName) {
                try {
                    const custRes = await api.get(`/customers/${sale.customer_id}`);
                    customerName = custRes.data?.data?.name;
                    customerPhone = custRes.data?.data?.phone;
                } catch (e) {
                    console.warn("Failed to fetch customer for print");
                }
            }

            // 3. Hydrate Items (Fetch Name & Batch Info)
            const enrichedItems = await Promise.all(items.map(async (item: any) => {
                let productName = item.medicines?.name || '';
                let batchNumber = item.medicine_batches?.batch_number || '';
                let expiryDate = item.medicine_batches?.expiry_date || '';
                const quantity = toNumber(item.quantity);
                const unitPrice = toNumber(item.unit_price ?? item.mrp ?? item.price);
                const gstRate = toNumber(item.gst_rate);
                const discountPercent = toNumber(item.discount_pct ?? item.discount_percent);
                const lineDiscount = toNumber(item.discount_amount, quantity * unitPrice * discountPercent / 100);
                const lineBase = Math.max(0, quantity * unitPrice - lineDiscount);
                const total = toNumber(item.total ?? item.total_amount,
                    Math.round(lineBase * (priceIncludesTax ? 1 : 1 + gstRate / 100) * 100) / 100);

                if (!productName || !batchNumber) {
                    try {
                        const medRes = await api.get(`/inventory/medicines/${item.medicine_id || item.product_id}`);
                        const med = medRes.data?.data;
                        productName = med?.name || productName || 'Unknown Product';
                        
                        const batch = med?.batches?.find((b: any) => (b.id || b._local_id) === (item.batch_id || item.batchId));
                        batchNumber = batch?.batch_number || batchNumber || 'N/A';
                        expiryDate = batch?.expiry_date || expiryDate || 'N/A';
                    } catch (e) {
                        console.warn("Failed to fetch medicine for print", e);
                        productName = productName || 'Unknown Product';
                        batchNumber = batchNumber || 'N/A';
                        expiryDate = expiryDate || 'N/A';
                    }
                }

                return {
                    batch: {
                        batch_number: batchNumber,
                        expiry_date: expiryDate
                    },
                    productName,
                    quantity,
                    unitPrice,
                    total,
                    gstRate,
                    discountPercent,
                };
            }));

            // 4. Trigger Print via Robust Utility
            await printBill({
                shopProfile: profile,
                customerName,
                customerPhone,
                invoiceNumber: saleData.invoice_number || 'Draft',
                date: invoiceDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                time: invoiceDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
                items: enrichedItems,
                subtotal,
                gstAmount,
                discount,
                finalTotal,
                priceIncludesTax,
                paymentMethod: paymentModes[paymentMode] || (paymentMode || undefined),
                paidAmount,
                balanceDue,
            });

        } catch (error) {
            console.error("Print failed:", error);
            throw error;
        }
    }
}
