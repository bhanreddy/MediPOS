import { db } from '../db/index';
import type {
    SalesReportSummary,
    TaxReport,
    TaxReportItem,
    StockValueReport,
    ExpiryReportItem,
    ProfitReport
} from '../core/types';

/**
 * PHASE 8: REPORT SERVICE
 * Read-Only Analytics Engine.
 * Truth comes from IndexedDB.
 */

export const ReportService = {

    // --- 1. SALES REPORTS ---

    async getSalesReport(startDate: string, endDate: string): Promise<SalesReportSummary> {
        const sales = await db.sales
            .where('created_at')
            .between(startDate, endDate, true, true)
            .toArray();

        const summary: SalesReportSummary = {
            startDate,
            endDate,
            totalBills: sales.length,
            totalAmount: 0,
            totalDiscount: 0,
            totalTax: 0,
            netAmount: 0,
            paymentModeBreakdown: {}
        };

        for (const sale of sales) {
            summary.totalAmount += sale.total_amount;
            summary.totalDiscount += sale.discount_amount;
            summary.totalTax += sale.tax_amount;
            summary.netAmount += sale.final_amount;

            // Group by Payment Mode
            const mode = sale.payment_mode;
            summary.paymentModeBreakdown[mode] = (summary.paymentModeBreakdown[mode] || 0) + sale.final_amount;
        }

        // Rounding
        summary.totalAmount = Math.round(summary.totalAmount * 100) / 100;
        summary.totalDiscount = Math.round(summary.totalDiscount * 100) / 100;
        summary.totalTax = Math.round(summary.totalTax * 100) / 100;
        summary.netAmount = Math.round(summary.netAmount * 100) / 100;

        return summary;
    },

    // --- 2. GST / TAX REPORTS ---

    async getTaxReport(startDate: string, endDate: string): Promise<TaxReport> {
        // We need Sale Items to get granular Tax Rate breakdown
        // Querying sale_items by time is tricky as they don't have 'created_at' index usually?
        // In Phase 2 Schema: `sale_items: 'id, sale_id, product_id, batch_id'`
        // They are linked to Sales.
        // Efficient Strategy: Get Sales IDs first, then get Items.
        // Or if `sale_items` has `created_at` (Schema Phase 6 updated types, but DB schema?).
        // `db / index.ts` Phase 7 status: `sale_items` does NOT have `created_at` index.
        // So filter Sales first.

        const sales = await db.sales
            .where('created_at')
            .between(startDate, endDate, true, true)
            .toArray();

        const saleIds = sales.map(s => s.id);
        const saleById = new Map(sales.map(s => [s.id, s]));
        const placeHolderItems = await db.sale_items.where('sale_id').anyOf(saleIds).toArray();

        // Aggregate
        const taxMap = new Map<number, TaxReportItem>();

        let totalTaxable = 0;
        let totalTax = 0;

        for (const item of placeHolderItems) {
            const rate = item.gst_rate || 0;

            if (!taxMap.has(rate)) {
                taxMap.set(rate, {
                    gstRate: rate,
                    taxableAmount: 0,
                    taxAmount: 0,
                    cgst: 0,
                    sgst: 0,
                    igst: 0
                });
            }

            const record = taxMap.get(rate)!;

            // Re-derive Taxable? 
            // item.total_amount is Final (Inclusive).
            // item.tax_amount is Tax.
            // Taxable = Total - Tax.
            const taxable = item.total_amount - item.tax_amount;

            record.taxableAmount += taxable;
            record.taxAmount += item.tax_amount;

            const sale = saleById.get(item.sale_id);
            const inter = sale?.supply_type === 'INTER';
            if (inter) {
                record.igst += item.tax_amount;
            } else {
                const half = Math.round((item.tax_amount / 2) * 100) / 100;
                record.cgst += half;
                record.sgst += Math.round((item.tax_amount - half) * 100) / 100;
            }

            totalTaxable += taxable;
            totalTax += item.tax_amount;
        }

        return {
            startDate,
            endDate,
            totalTaxable: Math.round(totalTaxable * 100) / 100,
            totalTax: Math.round(totalTax * 100) / 100,
            breakdown: Array.from(taxMap.values())
        };
    },

    // --- 3. INVENTORY & VALUATION ---

    async getStockValueReport(): Promise<StockValueReport> {
        // Full Audit of Inventory
        const allInventory = await db.inventory.toArray();
        const batchIds = [...new Set(allInventory.map(i => i.batch_id))];
        const batches = await db.batches.bulkGet(batchIds);
        const validBatches = batches.filter(b => b !== undefined); // TS check

        let totalQty = 0;
        let purchaseVal = 0;
        let salesVal = 0;

        const batchMap = new Map(validBatches.map(b => [b!.id, b!]));

        for (const item of allInventory) {
            if (item.quantity <= 0) continue;

            const batch = batchMap.get(item.batch_id);
            if (!batch) continue;

            totalQty += item.quantity;
            purchaseVal += item.quantity * batch.purchase_rate;
            salesVal += item.quantity * batch.mrp; // Valuation at MRP
        }

        return {
            totalItems: new Set(validBatches.map(b => b!.product_id)).size,
            totalBatches: validBatches.length,
            totalQuantity: totalQty,
            totalPurchaseValue: Math.round(purchaseVal * 100) / 100,
            totalSalesValue: Math.round(salesVal * 100) / 100
        };
    },

    async getExpiryReport(daysThreshold: number): Promise<ExpiryReportItem[]> {
        const today = new Date();
        const targetDate = new Date();
        targetDate.setDate(today.getDate() + daysThreshold);

        // Format YYYY-MM-DD
        const targetStr = targetDate.toISOString().split('T')[0];

        // Find batches expiring before targetStr
        // But we only care if they have STOCK.
        // Query Batches first (Indexed on expiry).
        // Note: This might return matches with 0 stock. We must filter.
        const riskyBatches = await db.batches
            .where('expiry_date')
            .belowOrEqual(targetStr)
            .toArray();

        const report: ExpiryReportItem[] = [];

        for (const batch of riskyBatches) {
            const inv = await db.inventory.where('batch_id').equals(batch.id).toArray();
            const qty = inv.reduce((sum, i) => sum + i.quantity, 0);

            if (qty > 0) {
                // Fetch Product Name
                const product = await db.products.get(batch.product_id);

                // Calculate Days diff
                const exp = new Date(batch.expiry_date);
                const diffTime = exp.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                report.push({
                    batchId: batch.id,
                    productName: product?.name || 'Unknown',
                    batchNumber: batch.batch_number,
                    expiryDate: batch.expiry_date,
                    quantity: qty,
                    daysToExpiry: diffDays
                });
            }
        }

        return report.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
    },

    // --- 4. PROFIT ESTIMATION ---

    async getProfitReport(startDate: string, endDate: string): Promise<ProfitReport> {
        // This is the tricky one.
        // Revenue = Sum(Sales.FinalAmount) - Tax? 
        // Gross Profit = Revenue - COGS.
        // COGS = Sum(SoldItem.Quantity * Batch.PurchaseRate).

        const sales = await db.sales
            .where('created_at')
            .between(startDate, endDate, true, true)
            .toArray();

        const saleIds = sales.map(s => s.id);
        const items = await db.sale_items.where('sale_id').anyOf(saleIds).toArray();

        let totalRevenue = 0; // Net of Tax ? Usually "Sales" in P&L is Net Sales.
        // Let's use Base Amount (Total - Tax).

        let totalCOGS = 0;

        // We need Batches to get Purchase Rate for each sold item.
        // items have `batch_id`.
        // Bulk fetch batches.
        const uniqueBatchIds = [...new Set(items.map(i => i.batch_id))];
        const batches = await db.batches.bulkGet(uniqueBatchIds);
        const batchMap = new Map(batches.filter(b => b !== undefined).map(b => [b!.id, b!]));

        for (const item of items) {
            const batch = batchMap.get(item.batch_id);
            if (!batch) continue; // Should not happen in strict system

            // Revenue Contribution (Net of Tax)
            // item.total_amount is Inclusive. item.tax_amount is Tax.
            const netSale = item.total_amount - item.tax_amount;
            totalRevenue += netSale;

            // COGS
            const cost = item.quantity * batch.purchase_rate;
            totalCOGS += cost;
        }

        const grossProfit = totalRevenue - totalCOGS;
        const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

        return {
            startDate,
            endDate,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalCostOfGoodsSold: Math.round(totalCOGS * 100) / 100,
            grossProfit: Math.round(grossProfit * 100) / 100,
            marginPercent: Math.round(margin * 100) / 100
        };
    },

    async getDailyRevenueSeries(startDate: string, endDate: string): Promise<{ date: string; amount: number }[]> {
        const sales = await db.sales
            .where('created_at')
            .between(startDate, endDate, true, true)
            .toArray();
        const byDay = new Map<string, number>();
        for (const s of sales) {
            const d = s.created_at.slice(0, 10);
            byDay.set(d, (byDay.get(d) ?? 0) + s.final_amount);
        }
        return [...byDay.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }));
    },

    async getTopSellingProducts(
        startDate: string,
        endDate: string,
        limit = 10
    ): Promise<{ productId: string; name: string; quantity: number; revenue: number }[]> {
        const sales = await db.sales
            .where('created_at')
            .between(startDate, endDate, true, true)
            .toArray();
        const saleIds = sales.map(s => s.id);
        if (!saleIds.length) return [];
        const items = await db.sale_items.where('sale_id').anyOf(saleIds).toArray();
        const agg = new Map<string, { qty: number; revenue: number }>();
        for (const it of items) {
            const cur = agg.get(it.product_id) ?? { qty: 0, revenue: 0 };
            cur.qty += it.quantity;
            cur.revenue += it.total_amount;
            agg.set(it.product_id, cur);
        }
        const rows: { productId: string; name: string; quantity: number; revenue: number }[] = [];
        for (const [pid, v] of agg) {
            const p = await db.products.get(pid);
            rows.push({
                productId: pid,
                name: p?.name ?? 'Unknown',
                quantity: v.qty,
                revenue: Math.round(v.revenue * 100) / 100,
            });
        }
        rows.sort((a, b) => b.quantity - a.quantity);
        return rows.slice(0, limit);
    },

    async getProductMargins(
        startDate: string,
        endDate: string
    ): Promise<{ productId: string; name: string; profit: number; marginPercent: number }[]> {
        const sales = await db.sales
            .where('created_at')
            .between(startDate, endDate, true, true)
            .toArray();
        const saleIds = sales.map(s => s.id);
        if (!saleIds.length) return [];
        const items = await db.sale_items.where('sale_id').anyOf(saleIds).toArray();
        const batchIds = [...new Set(items.map(i => i.batch_id))];
        const batches = await db.batches.bulkGet(batchIds);
        const batchMap = new Map(batches.filter(Boolean).map(b => [b!.id, b!]));

        const byProduct = new Map<string, { revenueNet: number; cogs: number }>();
        for (const it of items) {
            const batch = batchMap.get(it.batch_id);
            if (!batch) continue;
            const net = it.total_amount - it.tax_amount;
            const cogs = it.quantity * batch.purchase_rate;
            const cur = byProduct.get(it.product_id) ?? { revenueNet: 0, cogs: 0 };
            cur.revenueNet += net;
            cur.cogs += cogs;
            byProduct.set(it.product_id, cur);
        }

        const out: { productId: string; name: string; profit: number; marginPercent: number }[] = [];
        for (const [pid, v] of byProduct) {
            const p = await db.products.get(pid);
            const profit = Math.round((v.revenueNet - v.cogs) * 100) / 100;
            const marginPercent = v.revenueNet > 0 ? Math.round((profit / v.revenueNet) * 10000) / 100 : 0;
            out.push({ productId: pid, name: p?.name ?? 'Unknown', profit, marginPercent });
        }
        out.sort((a, b) => b.profit - a.profit);
        return out;
    }
};
