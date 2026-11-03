import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, isValid, parseISO } from 'date-fns';
import { Plus } from 'lucide-react';
import { useDirectory } from '../../hooks/useDirectory';
import { LoadError, NoSearchResults, Pagination } from '../ui/ListFeedback';
import type { Purchase } from '../../core/types';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table';
import { formatInr } from '../../lib/formatInr';

type Row = Purchase & { supplierName: string };

const primaryLinkClass =
    'inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-on-primary px-5 py-2.5 font-extrabold uppercase tracking-widest text-xs shadow-md shadow-primary/20 border border-white/10 hover:brightness-110 transition-all';

function resolveSupplierName(p: Record<string, unknown>, smap: Map<string, string>): string {
    const fromApi = String((p.suppliers as { name?: string } | undefined)?.name ?? p.supplier_name ?? '').trim();
    if (fromApi) return fromApi;
    const sid = p.supplier_id as string | null | undefined;
    if (sid && smap.get(sid)) return smap.get(sid)!;
    if (!sid) return 'Direct inward';
    return 'Unknown supplier';
}

function resolvePurchaseStatus(p: Record<string, unknown>): 'PENDING' | 'COMPLETED' {
    const explicit = String(p.status ?? '').toUpperCase();
    if (explicit === 'PENDING' || explicit === 'DRAFT') return 'PENDING';
    // Recorded purchases add stock immediately — treat as completed inward.
    return 'COMPLETED';
}

function resolvePaymentPending(p: Record<string, unknown>): boolean {
    const paymentStatus = String(p.payment_status ?? 'unpaid').toLowerCase();
    return Boolean(p.supplier_id) && paymentStatus !== 'paid';
}

function formatOptionalDate(value: string | null | undefined): string {
    if (!value?.trim()) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISO(value) : new Date(value);
    return isValid(d) ? format(d, 'dd MMM yyyy') : '—';
}

export const PurchasesListPage: React.FC = () => {
    const [q, setQ] = useState('');

    const { rows: rawRows, loading, error, refresh, page, limit, total, setPage, fetching } = useDirectory<Record<string, unknown>>('/purchases', q);
    const rows = useMemo(() => rawRows.map(p => ({ ...p,
        supplierName: resolveSupplierName(p, new Map()),
        invoice_date: p.invoice_date ?? String(p.created_at ?? '').slice(0, 10),
        received_date: p.received_date ?? String(p.created_at ?? '').slice(0, 10),
        total_amount: Number(p.total_amount ?? p.net_amount ?? 0),
        status: resolvePurchaseStatus(p),
    })) as Row[], [rawRows]);
    const filtered = rows;

    const totalValue = useMemo(() => rows.reduce((a, r) => a + r.total_amount, 0), [rows]);
    const pendingPaymentCount = useMemo(
        () => rows.filter((r) => resolvePaymentPending(r as unknown as Record<string, unknown>)).length,
        [rows]
    );

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6 animate-slideIn">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-black text-foreground-strong tracking-tight">Purchases</h1>
                    <p className="text-sm text-muted mt-1">Supplier invoices and inward stock — commit from the purchase screen.</p>
                </div>
                <Link to="/purchases/new" className={primaryLinkClass}>
                    <Plus className="w-4 h-4" />
                    New purchase
                </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-4">
                    <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">Purchases in this view</p>
                    <p className="text-xl font-black tabular-nums mt-1">{total}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">Inward value on this page</p>
                    <p className="text-xl font-black tabular-nums mt-1">{formatInr(totalValue)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">Unpaid bills on this page</p>
                    <p className="text-xl font-black tabular-nums mt-1">{pendingPaymentCount}</p>
                </Card>
            </div>

            <Card className="p-4 space-y-4">
                <Input placeholder="Search invoice, supplier or payment status…" value={q} aria-label="Search purchases" onChange={(e) => { setQ(e.target.value); setPage(1); }} icon="🔍" />
                {error && <LoadError onRetry={() => void refresh()} />}
                <Table aria-busy={loading || fetching}>
                    <TableHeader>
                        <TableRow>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Invoice #</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Supplier</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Invoice date</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Received</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider text-right">Total</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Status</TableCell>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {error ? null : loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted py-12">
                                    Loading purchases…
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-16">
                                    {q.trim() ? <NoSearchResults onClear={() => { setQ(''); setPage(1); }} /> : <>
                                    <p className="text-muted font-medium mb-4">No purchase records yet.</p>
                                    <Link to="/purchases/new" className={primaryLinkClass}>
                                        Record inward stock
                                    </Link></>}
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((r) => (
                                <TableRow key={r.id}>
                                    <TableCell className="font-mono font-bold">{r.invoice_number}</TableCell>
                                    <TableCell>{r.supplierName}</TableCell>
                                    <TableCell className="text-muted text-sm">{formatOptionalDate(r.invoice_date)}</TableCell>
                                    <TableCell className="text-muted text-sm">{formatOptionalDate(r.received_date)}</TableCell>
                                    <TableCell className="text-right font-black tabular-nums">{formatInr(r.total_amount)}</TableCell>
                                    <TableCell>
                                        <Badge variant={r.status === 'COMPLETED' ? 'success' : 'warning'}>{r.status}</Badge>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                {!error && <Pagination page={page} limit={limit} total={total} onPage={setPage} busy={loading || fetching} />}
            </Card>
        </div>
    );
};
