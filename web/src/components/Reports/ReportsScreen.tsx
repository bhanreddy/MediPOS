import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import type { RootState } from '../../state/store';
import { reportSlice } from '../../state/slices/reportSlice';
import { ReportService } from '../../services/reportService';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Table } from '../ui/Table';
import { REPORTS_SCREEN_COPY } from '../../config/appContent';

const toISODate = (d: Date): string => d.toISOString().split('T')[0];
const startOfDayISO = (dateStr: string) => `${dateStr}T00:00:00.000Z`;
const endOfDayISO = (dateStr: string) => `${dateStr}T23:59:59.999Z`;

export const ReportsScreen: React.FC = () => {
    const dispatch = useDispatch();
    const reports = useSelector((s: RootState) => s.reports);

    const todayStr = useMemo(() => toISODate(new Date()), []);
    const monthStartStr = useMemo(() => {
        const d = new Date();
        const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
        return toISODate(start);
    }, []);

    const [startDate, setStartDate] = useState(monthStartStr);
    const [endDate, setEndDate] = useState(todayStr);
    const [expiryDays, setExpiryDays] = useState('60');

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runReports = async () => {
        setError(null);
        const s = startDate;
        const e = endDate;
        if (!s || !e) {
            setError('Start and end date are required');
            return;
        }
        if (s > e) {
            setError('Start date must be <= end date');
            return;
        }

        const expDays = Number(expiryDays);
        if (!Number.isFinite(expDays) || expDays <= 0) {
            setError('Expiry threshold must be a positive number');
            return;
        }

        setIsLoading(true);
        try {
            const startISO = startOfDayISO(s);
            const endISO = endOfDayISO(e);

            const [sales, tax, stock, expiry, profit] = await Promise.all([
                ReportService.getSalesReport(startISO, endISO),
                ReportService.getTaxReport(startISO, endISO),
                ReportService.getStockValueReport(),
                ReportService.getExpiryReport(expDays),
                ReportService.getProfitReport(startISO, endISO),
            ]);

            dispatch(reportSlice.actions.setSalesReport(sales));
            dispatch(reportSlice.actions.setTaxReport(tax));
            dispatch(reportSlice.actions.setStockValueReport(stock));
            dispatch(reportSlice.actions.setExpiryReport(expiry));
            dispatch(reportSlice.actions.setProfitReport(profit));
        } catch (e: any) {
            setError(e?.message || 'Failed to generate reports');
        } finally {
            setIsLoading(false);
        }
    };

    const quickToday = () => {
        setStartDate(todayStr);
        setEndDate(todayStr);
    };

    const quickThisMonth = () => {
        setStartDate(monthStartStr);
        setEndDate(todayStr);
    };

    const paymentRows = useMemo(() => {
        const src = reports.salesReport?.paymentModeBreakdown ?? {};
        return Object.entries(src)
            .map(([mode, amount]) => ({ mode, amount }))
            .sort((a, b) => b.amount - a.amount);
    }, [reports.salesReport]);

    return (
        <div className="h-full flex flex-col gap-8 animate-slideIn select-none">
            <div className="flex justify-between items-end gap-6 flex-wrap">
                <div className="space-y-1">
                    <h2 className="text-billing-total font-black text-foreground-strong tracking-tighter uppercase italic leading-none">
                        {REPORTS_SCREEN_COPY.title}
                    </h2>
                    <p className="text-muted text-sm font-black uppercase tracking-widest">{REPORTS_SCREEN_COPY.subtitle}</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Button variant="secondary" onClick={quickToday}>
                        {REPORTS_SCREEN_COPY.today}
                    </Button>
                    <Button variant="secondary" onClick={quickThisMonth}>
                        {REPORTS_SCREEN_COPY.thisMonth}
                    </Button>
                    <Button variant="primary" onClick={runReports} isLoading={isLoading}>
                        {REPORTS_SCREEN_COPY.generate}
                    </Button>
                </div>
            </div>

            {error && (
                <div className="bg-danger/10 border-2 border-danger text-danger px-4 py-3 rounded-md font-black uppercase tracking-widest text-xs">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                <Input label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                <Input
                    label="Expiry Threshold (Days)"
                    value={expiryDays}
                    onChange={e => setExpiryDays(e.target.value)}
                    placeholder="e.g. 30 / 60 / 90"
                />
                <div className="bg-surface border-2 border-border rounded-xl p-4 flex items-center justify-between">
                    <div>
                        <div className="text-label font-black uppercase tracking-widest text-muted">Last Generated</div>
                        <div className="text-xs font-black uppercase tracking-widest text-muted tabular-nums mt-1">
                            {reports.lastGenerated ? new Date(reports.lastGenerated).toLocaleString() : '—'}
                        </div>
                    </div>
                    <div className="text-4xl opacity-10">📈</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <div className="bg-surface-elevated border-2 border-primary/20 p-6 rounded-2xl flex items-center justify-between">
                    <div>
                        <p className="text-label font-black uppercase tracking-widest text-primary/60 mb-2">Net Sales</p>
                        <p className="text-3xl font-black text-foreground-strong italic tracking-tighter tabular-nums text-primary">
                            ₹{(reports.salesReport?.netAmount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                        <div className="mt-2">
                            <Badge variant="primary">Bills: {reports.salesReport?.totalBills ?? 0}</Badge>
                        </div>
                    </div>
                    <div className="text-6xl opacity-10">🧾</div>
                </div>

                <div className="bg-surface-elevated border-2 border-border p-6 rounded-2xl flex items-center justify-between">
                    <div>
                        <p className="text-label font-black uppercase tracking-widest text-muted mb-2">Tax</p>
                        <p className="text-3xl font-black text-foreground-strong italic tracking-tighter tabular-nums">
                            ₹{(reports.salesReport?.totalTax ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div className="text-6xl opacity-10">🧮</div>
                </div>

                <div className="bg-surface-elevated border-2 border-border p-6 rounded-2xl flex items-center justify-between">
                    <div>
                        <p className="text-label font-black uppercase tracking-widest text-muted mb-2">Discount</p>
                        <p className="text-3xl font-black text-foreground-strong italic tracking-tighter tabular-nums">
                            ₹{(reports.salesReport?.totalDiscount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div className="text-6xl opacity-10">🏷️</div>
                </div>

                <div className="bg-surface-elevated border-2 border-success/20 p-6 rounded-2xl flex items-center justify-between">
                    <div>
                        <p className="text-label font-black uppercase tracking-widest text-success/60 mb-2">Gross Profit</p>
                        <p className="text-3xl font-black text-foreground-strong italic tracking-tighter tabular-nums text-success">
                            ₹{(reports.profitReport?.grossProfit ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                        <div className="mt-2">
                            <Badge variant="success">Margin: {(reports.profitReport?.marginPercent ?? 0).toFixed(2)}%</Badge>
                        </div>
                    </div>
                    <div className="text-6xl opacity-10">💹</div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 min-h-0 flex-1">
                <div className="flex flex-col gap-4 min-h-0">
                    <div className="flex items-center justify-between">
                        <div className="text-heading font-black uppercase tracking-widest text-foreground-strong">Payment Modes</div>
                        <Badge variant="neutral">Net: ₹{(reports.salesReport?.netAmount ?? 0).toFixed(2)}</Badge>
                    </div>
                    <div className="flex-1 min-h-0">
                        <Table
                            headers={['MODE', 'AMOUNT_INR']}
                            data={paymentRows}
                            renderRow={(row: { mode: string; amount: number }, index) => (
                                <tr key={`${row.mode}-${index}`} className="border-b-2 border-border hover:bg-surface-elevated">
                                    <td className="px-6 py-4 font-black text-foreground-strong uppercase">{row.mode}</td>
                                    <td className="px-6 py-4 text-right font-black text-foreground-strong tabular-nums">₹{row.amount.toFixed(2)}</td>
                                </tr>
                            )}
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-4 min-h-0">
                    <div className="flex items-center justify-between">
                        <div className="text-heading font-black uppercase tracking-widest text-foreground-strong">Tax Breakdown</div>
                        <Badge variant="warning">Tax: ₹{(reports.taxReport?.totalTax ?? 0).toFixed(2)}</Badge>
                    </div>
                    <div className="flex-1 min-h-0">
                        <Table
                            headers={['GST_RATE', 'TAXABLE', 'TAX']}
                            data={reports.taxReport?.breakdown ?? []}
                            renderRow={(row: any, index) => (
                                <tr key={index} className="border-b-2 border-border hover:bg-surface-elevated">
                                    <td className="px-6 py-4 font-black text-foreground-strong tabular-nums">{row.gstRate}%</td>
                                    <td className="px-6 py-4 text-right text-muted tabular-nums">₹{Number(row.taxableAmount ?? 0).toFixed(2)}</td>
                                    <td className="px-6 py-4 text-right font-black text-foreground-strong tabular-nums">₹{Number(row.taxAmount ?? 0).toFixed(2)}</td>
                                </tr>
                            )}
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 min-h-0 flex-1">
                <div className="bg-surface border-2 border-border rounded-2xl p-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="text-heading font-black uppercase tracking-widest text-foreground-strong">Stock Valuation</div>
                        <Badge variant="neutral">Live</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-surface-elevated border-2 border-border rounded-xl p-4">
                            <div className="text-label font-black uppercase tracking-widest text-muted">Total Qty</div>
                            <div className="text-2xl font-black text-foreground-strong tabular-nums mt-1">{reports.stockValueReport?.totalQuantity ?? 0}</div>
                        </div>
                        <div className="bg-surface-elevated border-2 border-border rounded-xl p-4">
                            <div className="text-label font-black uppercase tracking-widest text-muted">Batches</div>
                            <div className="text-2xl font-black text-foreground-strong tabular-nums mt-1">{reports.stockValueReport?.totalBatches ?? 0}</div>
                        </div>
                        <div className="bg-surface-elevated border-2 border-border rounded-xl p-4">
                            <div className="text-label font-black uppercase tracking-widest text-muted">Purchase Value</div>
                            <div className="text-2xl font-black text-foreground-strong tabular-nums mt-1">₹{(reports.stockValueReport?.totalPurchaseValue ?? 0).toFixed(2)}</div>
                        </div>
                        <div className="bg-surface-elevated border-2 border-border rounded-xl p-4">
                            <div className="text-label font-black uppercase tracking-widest text-muted">Sales Value</div>
                            <div className="text-2xl font-black text-foreground-strong tabular-nums mt-1">₹{(reports.stockValueReport?.totalSalesValue ?? 0).toFixed(2)}</div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-4 min-h-0">
                    <div className="flex items-center justify-between">
                        <div className="text-heading font-black uppercase tracking-widest text-foreground-strong">Expiring Stock</div>
                        <Badge variant="danger">Within {expiryDays} days</Badge>
                    </div>
                    <div className="flex-1 min-h-0">
                        <Table
                            headers={['PRODUCT', 'BATCH', 'EXPIRY', 'QTY', 'DAYS']}
                            data={(reports.expiryReport ?? []).slice(0, 50)}
                            renderRow={(row: any, index) => (
                                <tr key={index} className="border-b-2 border-border hover:bg-surface-elevated">
                                    <td className="px-6 py-4 font-black text-foreground-strong uppercase">{row.productName}</td>
                                    <td className="px-4 py-4 text-muted tabular-nums">{row.batchNumber}</td>
                                    <td className="px-4 py-4 text-muted tabular-nums">{row.expiryDate}</td>
                                    <td className="px-4 py-4 text-right text-muted tabular-nums">{row.quantity}</td>
                                    <td className="px-6 py-4 text-right font-black tabular-nums">
                                        <Badge variant={row.daysToExpiry <= 7 ? 'danger' : row.daysToExpiry <= 30 ? 'warning' : 'neutral'}>
                                            {row.daysToExpiry}
                                        </Badge>
                                    </td>
                                </tr>
                            )}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
