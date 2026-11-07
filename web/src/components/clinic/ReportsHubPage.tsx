import { BranchAnalyticsPanel } from './BranchAnalyticsPanel';
import { PharmacyReportsPanel } from './PharmacyReportsPanel';
import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { LineChart as LineChartIcon, ShoppingCart, Wallet, FileText, PieChart } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { fetchAllPages } from '../../lib/fetchAllPages';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table';
import { formatInr } from '../../lib/formatInr';

const REPORTS = [
    {
        id: 'sales',
        title: 'Sales report',
        desc: 'Invoice-wise GST and payment summary for any period.',
        icon: LineChartIcon,
        tone: 'sapphire',
    },
    {
        id: 'purchase',
        title: 'Purchase report',
        desc: 'Inward value, ITC alignment, and supplier mix.',
        icon: ShoppingCart,
        tone: 'blue',
    },
    {
        id: 'expense',
        title: 'Expense report',
        desc: 'Category burn and voucher trail for audits.',
        icon: Wallet,
        tone: 'amber',
    },
    {
        id: 'gst',
        title: 'GST report',
        desc: 'GSTR-friendly totals with intra / inter split.',
        icon: FileText,
        tone: 'violet',
    },
    {
        id: 'pnl',
        title: 'Profit & loss',
        desc: 'Revenue, COGS, and margin at shop level.',
        icon: PieChart,
        tone: 'violet',
    },
] as const;

type ReportId = (typeof REPORTS)[number]['id'];

type SummaryItem = { label: string; value: string };
type ReportPreview = {
    title: string;
    summary: SummaryItem[];
    columns: string[];
    rows: Array<(string | number)[]>;
};

const toISODate = (d: Date) => d.toISOString().split('T')[0];
const startOfDayISO = (dateStr: string) => `${dateStr}T00:00:00.000Z`;
const endOfDayISO = (dateStr: string) => `${dateStr}T23:59:59.999Z`;

function titleCase(value: string) {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const ReportsHubPage: React.FC = () => {
    const todayStr = useMemo(() => toISODate(new Date()), []);
    const monthStartStr = useMemo(() => {
        const d = new Date();
        return toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
    }, []);

    const [selected, setSelected] = useState<ReportId>('sales');
    const [fromDate, setFromDate] = useState(monthStartStr);
    const [toDate, setToDate] = useState(todayStr);
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<ReportPreview | null>(null);

    const selectedMeta = REPORTS.find((r) => r.id === selected)!;

    const generateReport = async () => {
        if (!fromDate || !toDate) {
            toast.error('Select both from and to dates');
            return;
        }
        if (fromDate > toDate) {
            toast.error('From date must be on or before to date');
            return;
        }

        const startISO = startOfDayISO(fromDate);
        const endISO = endOfDayISO(toDate);

        setLoading(true);
        try {
            let nextPreview: ReportPreview;

            switch (selected) {
                case 'sales': {
                    const [productsRes, pnlRes] = await Promise.all([
                        api.get('/reports/product-wise', { params: { from: startISO, to: endISO } }),
                        api.get('/reports/profit-loss', { params: { from: startISO, to: endISO } }),
                    ]);
                    const products = productsRes.data?.data ?? [];
                    const pnl = pnlRes.data?.data ?? {};
                    nextPreview = {
                        title: 'Sales report',
                        summary: [
                            { label: 'Net revenue', value: formatInr(Number(pnl.net_revenue ?? 0), 2) },
                            { label: 'Gross revenue', value: formatInr(Number(pnl.gross_revenue ?? 0), 2) },
                            { label: 'Products sold', value: String(products.length) },
                        ],
                        columns: ['Product', 'Qty sold', 'Revenue'],
                        rows: products.map((r: Record<string, unknown>) => [
                            String(r.medicine_name ?? 'Unknown'),
                            Number(r.total_qty_sold ?? 0),
                            formatInr(Number(r.total_revenue ?? 0), 2),
                        ]),
                    };
                    break;
                }
                case 'purchase': {
                    const res = await api.get('/reports/gst-purchases', { params: { from: startISO, to: endISO } });
                    const rows = res.data?.data ?? [];
                    const totalTaxable = rows.reduce((a: number, r: Record<string, unknown>) => a + Number(r.taxable_amount ?? 0), 0);
                    const totalGst = rows.reduce((a: number, r: Record<string, unknown>) => a + Number(r.total_gst ?? 0), 0);
                    nextPreview = {
                        title: 'Purchase report',
                        summary: [
                            { label: 'Taxable value', value: formatInr(totalTaxable, 2) },
                            { label: 'Input GST', value: formatInr(totalGst, 2) },
                            { label: 'GST slabs', value: String(rows.length) },
                        ],
                        columns: ['GST %', 'Taxable', 'CGST', 'SGST', 'Total GST'],
                        rows: rows.map((r: Record<string, unknown>) => [
                            `${Number(r.gst_rate ?? 0)}%`,
                            formatInr(Number(r.taxable_amount ?? 0), 2),
                            formatInr(Number(r.cgst ?? 0), 2),
                            formatInr(Number(r.sgst ?? 0), 2),
                            formatInr(Number(r.total_gst ?? 0), 2),
                        ]),
                    };
                    break;
                }
                case 'expense': {
                    const [summaryRes, expenses] = await Promise.all([
                        api.get('/expenses/summary', { params: { from: fromDate, to: toDate } }),
                        fetchAllPages<Record<string, unknown>>('/expenses', { from: fromDate, to: toDate }),
                    ]);
                    const summary = summaryRes.data?.data?.summary ?? [];
                    const grandTotal = Number(summaryRes.data?.data?.grand_total ?? 0);
                    nextPreview = {
                        title: 'Expense report',
                        summary: [
                            { label: 'Total spend', value: formatInr(grandTotal, 2) },
                            { label: 'Categories', value: String(summary.length) },
                            { label: 'Line items', value: String(expenses.length) },
                        ],
                        columns: ['Date', 'Category', 'Description', 'Amount', 'Paid via'],
                        rows: expenses.map((r: Record<string, unknown>) => [
                            r.expense_date ? format(new Date(String(r.expense_date)), 'dd MMM yyyy') : '—',
                            titleCase(String(r.category ?? '')),
                            String(r.description ?? '—'),
                            formatInr(Number(r.amount ?? 0), 2),
                            titleCase(String(r.payment_mode ?? 'cash')),
                        ]),
                    };
                    break;
                }
                case 'gst': {
                    const res = await api.get('/reports/gst-sales', { params: { from: startISO, to: endISO } });
                    const rows = res.data?.data ?? [];
                    const totalTaxable = rows.reduce((a: number, r: Record<string, unknown>) => a + Number(r.taxable_amount ?? 0), 0);
                    const totalGst = rows.reduce((a: number, r: Record<string, unknown>) => a + Number(r.total_gst ?? 0), 0);
                    nextPreview = {
                        title: 'GST report',
                        summary: [
                            { label: 'Taxable sales', value: formatInr(totalTaxable, 2) },
                            { label: 'Output GST', value: formatInr(totalGst, 2) },
                            { label: 'Gross (incl. GST)', value: formatInr(totalTaxable + totalGst, 2) },
                        ],
                        columns: ['GST %', 'Taxable', 'CGST', 'SGST', 'Total GST', 'Gross'],
                        rows: rows.map((r: Record<string, unknown>) => [
                            `${Number(r.gst_rate ?? 0)}%`,
                            formatInr(Number(r.taxable_amount ?? 0), 2),
                            formatInr(Number(r.cgst ?? 0), 2),
                            formatInr(Number(r.sgst ?? 0), 2),
                            formatInr(Number(r.total_gst ?? 0), 2),
                            formatInr(Number(r.gross_amount ?? 0), 2),
                        ]),
                    };
                    break;
                }
                case 'pnl': {
                    const res = await api.get('/reports/profit-loss', { params: { from: startISO, to: endISO } });
                    const p = res.data?.data ?? {};
                    nextPreview = {
                        title: 'Profit & loss',
                        summary: [
                            { label: 'Net revenue', value: formatInr(Number(p.net_revenue ?? 0), 2) },
                            { label: 'COGS', value: formatInr(Number(p.cogs ?? 0), 2) },
                            { label: 'Gross profit', value: formatInr(Number(p.gross_profit ?? 0), 2) },
                            { label: 'Expenses', value: formatInr(Number(p.total_expenses ?? 0), 2) },
                            { label: 'Net profit', value: formatInr(Number(p.net_profit ?? 0), 2) },
                            { label: 'Gross margin', value: `${Number(p.gross_margin_pct ?? 0).toFixed(2)}%` },
                        ],
                        columns: ['Metric', 'Amount'],
                        rows: [
                            ['Gross revenue', formatInr(Number(p.gross_revenue ?? 0), 2)],
                            ['Returns', formatInr(Number(p.total_returns ?? 0), 2)],
                            ['Net revenue', formatInr(Number(p.net_revenue ?? 0), 2)],
                            ['Cost of goods sold', formatInr(Number(p.cogs ?? 0), 2)],
                            ['Gross profit', formatInr(Number(p.gross_profit ?? 0), 2)],
                            ['Operating expenses', formatInr(Number(p.operating_expenses ?? p.total_expenses ?? 0), 2)],
                            ['Nex Coins redeemed (net of returns)', formatInr(Number(p.promotional_credit_cost ?? 0), 2)],
                            ['Net profit', formatInr(Number(p.net_profit ?? 0), 2)],
                        ],
                    };
                    break;
                }
                default:
                    throw new Error('Unknown report type');
            }

            setPreview(nextPreview);
            toast.success(`${nextPreview.title} generated`);
        } catch (e: unknown) {
            const msg =
                (e as { response?: { data?: { error?: { message?: string } | string } } })?.response?.data?.error;
            const message =
                (typeof msg === 'object' && msg?.message) ||
                (typeof msg === 'string' ? msg : null) ||
                (e instanceof Error ? e.message : 'Failed to generate report');
            toast.error(message);
            setPreview(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-slideIn">
            <div>
                <h1 className="text-2xl font-black text-foreground-strong tracking-tight">Reports</h1>
                <p className="text-sm text-muted mt-1">Pick a report, set the period, then generate to preview results.</p>
            </div>

            <Card className="p-4 flex flex-col sm:flex-row gap-4 sm:items-end">
                <Input
                    type="date"
                    label="From"
                    containerClassName="flex-1"
                    className="py-2.5"
                    value={fromDate}
                    disabled={loading}
                    onChange={(e) => { setFromDate(e.target.value); setPreview(null); }}
                />
                <Input
                    type="date"
                    label="To"
                    containerClassName="flex-1"
                    className="py-2.5"
                    value={toDate}
                    disabled={loading}
                    onChange={(e) => { setToDate(e.target.value); setPreview(null); }}
                />
                <Button
                    variant="primary"
                    type="button"
                    className="shrink-0"
                    onClick={() => void generateReport()}
                    isLoading={loading}
                >
                    Generate report
                </Button>
            </Card>

            <div className="workspace-report-layout">
            <div className="workspace-report-options">
                {REPORTS.map((r) => {
                    const Icon = r.icon;
                    const active = selected === r.id;
                    return (
                        <button
                            key={r.id}
                            type="button"
                            disabled={loading}
                            onClick={() => { setSelected(r.id); setPreview(null); }}
                            aria-pressed={active}
                            className={`report-option text-left rounded-xl border-2 p-5 transition-all hover:shadow-lg ${
                                active ? 'border-primary bg-primary/5 shadow-md' : 'border-border bg-bg-surface hover:border-primary/40'
                            }`}
                        >
                            <div className={`dashboard-symbol tone-${r.tone} mb-3`}>
                                <Icon className="w-6 h-6" />
                            </div>
                            <h2 className="font-black text-foreground-strong tracking-tight">{r.title}</h2>
                            <p className="text-sm text-muted mt-2 leading-relaxed">{r.desc}</p>
                        </button>
                    );
                })}
            </div>

            <Card className="p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">Preview</p>
                        <h2 className="text-lg font-black text-foreground-strong mt-1">
                            {preview?.title ?? selectedMeta.title}
                        </h2>
                        {fromDate && toDate && (
                            <p className="text-sm text-muted mt-1">
                                {format(new Date(fromDate), 'dd MMM yyyy')} – {format(new Date(toDate), 'dd MMM yyyy')}
                            </p>
                        )}
                    </div>
                    {preview && (
                        <Badge variant="success">Generated</Badge>
                    )}
                </div>

                {!preview ? (
                    <p className="text-sm text-muted border-2 border-dashed border-border rounded-xl p-6 text-center">
                        Select a report type and date range, then click <span className="font-bold text-foreground">Generate report</span>.
                    </p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            {preview.summary.map((item) => (
                                <div key={item.label} className="rounded-xl border border-border bg-surface-elevated p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{item.label}</p>
                                    <p className="text-base font-black tabular-nums mt-1 text-foreground-strong">{item.value}</p>
                                </div>
                            ))}
                        </div>

                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {preview.columns.map((col) => (
                                        <TableCell
                                            key={col}
                                            className={`text-muted font-bold uppercase text-xs tracking-wider ${
                                                col.toLowerCase().includes('amount') ||
                                                col.toLowerCase().includes('revenue') ||
                                                col.toLowerCase().includes('qty')
                                                    ? 'text-right'
                                                    : ''
                                            }`}
                                        >
                                            {col}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {preview.rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={preview.columns.length} className="text-center py-12 text-muted">
                                            No data for this period.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    preview.rows.map((row, idx) => (
                                        <TableRow key={idx}>
                                            {row.map((cell, cellIdx) => (
                                                <TableCell
                                                    key={cellIdx}
                                                    className={
                                                        cellIdx > 0 && typeof cell === 'string' && cell.startsWith('₹')
                                                            ? 'text-right font-bold tabular-nums'
                                                            : cellIdx > 0 && typeof cell === 'number'
                                                              ? 'text-right tabular-nums'
                                                              : ''
                                                    }
                                                >
                                                    {cell}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </>
                )}
            </Card>
            </div>
            <BranchAnalyticsPanel from={fromDate} to={toDate} />
            <PharmacyReportsPanel from={fromDate} to={toDate} />
        </div>
    );
};
