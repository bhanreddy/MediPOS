import api from '../lib/api';
import type {
    SalesReportSummary,
    TaxReport,
    TaxReportItem,
    StockValueReport,
    ExpiryReportItem,
    ProfitReport
} from '../core/types';

export const ReportService = {

    // --- 1. SALES REPORTS ---

    async getSalesReport(startDate: string, endDate: string): Promise<SalesReportSummary> {
        const res = await api.get(`/reports/profit-loss?from=${startDate}&to=${endDate}`);
        const p = res.data?.data || {};

        return {
            startDate,
            endDate,
            totalBills: 0,
            totalAmount: Number(p.gross_revenue || 0),
            totalDiscount: 0,
            totalTax: Number(p.gross_revenue || 0) - Number(p.net_revenue || 0),
            netAmount: Number(p.net_revenue || 0),
            paymentModeBreakdown: {}
        };
    },

    // --- 2. GST / TAX REPORTS ---

    async getTaxReport(startDate: string, endDate: string): Promise<TaxReport> {
        const res = await api.get(`/reports/gst-sales?from=${startDate}&to=${endDate}`);
        const items = res.data?.data || [];

        const breakdown: TaxReportItem[] = items.map((r: any) => ({
            gstRate: Number(r.gst_rate || 0),
            taxableAmount: Number(r.taxable_amount || 0),
            taxAmount: Number(r.total_gst || 0),
            cgst: Number(r.cgst || 0),
            sgst: Number(r.sgst || 0),
            igst: 0
        }));

        const totalTaxable = breakdown.reduce((sum, item) => sum + item.taxableAmount, 0);
        const totalTax = breakdown.reduce((sum, item) => sum + item.taxAmount, 0);

        return {
            startDate,
            endDate,
            totalTaxable,
            totalTax,
            breakdown
        };
    },

    // --- 3. INVENTORY & VALUATION ---

    async getStockValueReport(): Promise<StockValueReport> {
        const res = await api.get('/inventory/stock/summary');
        const summary = res.data?.data || {};

        return {
            totalItems: Number(summary.total_medicines || 0),
            totalBatches: Number(summary.total_batches || 0),
            totalQuantity: 0,
            totalPurchaseValue: Number(summary.total_stock_value || 0),
            totalSalesValue: Number(summary.total_stock_value || 0) * 1.2
        };
    },

    async getExpiryReport(daysThreshold: number): Promise<ExpiryReportItem[]> {
        const res = await api.get(`/inventory/batches/expiring?days=${daysThreshold}`);
        const list = res.data?.data || [];

        return list.map((item: any) => {
            const exp = new Date(item.expiry_date);
            const today = new Date();
            const diffTime = exp.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            return {
                batchId: item.id || item._local_id,
                productName: item.medicine_name || 'Medicine',
                batchNumber: item.batch_number,
                expiryDate: item.expiry_date,
                quantity: Number(item.quantity_remaining || 0),
                daysToExpiry: diffDays
            };
        });
    },

    // --- 4. PROFIT ESTIMATION ---

    async getProfitReport(startDate: string, endDate: string): Promise<ProfitReport> {
        const res = await api.get(`/reports/profit-loss?from=${startDate}&to=${endDate}`);
        const p = res.data?.data || {};

        return {
            startDate,
            endDate,
            totalRevenue: Number(p.net_revenue || 0),
            totalCostOfGoodsSold: Number(p.cogs || 0),
            grossProfit: Number(p.gross_profit || 0),
            marginPercent: Number(p.gross_margin_pct || 0)
        };
    },

    async getDailyRevenueSeries(_startDate: string, _endDate: string): Promise<{ date: string; amount: number }[]> {
        const res = await api.get('/reports/dashboard');
        const chart = res.data?.data?.daily_chart || [];
        return chart.map((c: any) => ({
            date: c.date,
            amount: Number(c.revenue || 0)
        }));
    },

    async getTopSellingProducts(
        startDate: string,
        endDate: string,
        limit = 10
    ): Promise<{ productId: string; name: string; quantity: number; revenue: number }[]> {
        const res = await api.get(`/reports/product-wise?from=${startDate}&to=${endDate}`);
        const data = res.data?.data || [];
        return data.slice(0, limit).map((r: any) => ({
            productId: r.medicine_id,
            name: r.medicine_name || 'Unknown',
            quantity: Number(r.total_qty_sold || 0),
            revenue: Number(r.total_revenue || 0)
        }));
    },

    async getProductMargins(
        startDate: string,
        endDate: string
    ): Promise<{ productId: string; name: string; profit: number; marginPercent: number }[]> {
        const res = await api.get(`/reports/product-wise?from=${startDate}&to=${endDate}`);
        const data = res.data?.data || [];
        return data.map((r: any) => {
            const profit = Number(r.total_revenue || 0) * 0.2;
            return {
                productId: r.medicine_id,
                name: r.medicine_name || 'Unknown',
                profit,
                marginPercent: 20
            };
        });
    }
};
