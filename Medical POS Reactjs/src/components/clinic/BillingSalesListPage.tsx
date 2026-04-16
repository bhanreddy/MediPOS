import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Plus, Eye, Printer } from 'lucide-react';
import { db } from '../../db/index';
import type { Sale } from '../../core/types';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table';
import { formatInr } from '../../lib/formatInr';

type Row = Sale & { customerLabel: string };

function saleStatusVariant(status: Sale['status']): 'success' | 'danger' | 'warning' {
    if (status === 'COMPLETED') return 'success';
    if (status === 'CANCELLED') return 'danger';
    return 'warning';
}

const primaryLinkClass =
    'inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-on-primary px-5 py-2.5 font-extrabold uppercase tracking-widest text-xs shadow-md shadow-primary/20 border border-white/10 hover:brightness-110 transition-all';

export const BillingSalesListPage: React.FC = () => {
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [sales, customers] = await Promise.all([db.sales.toArray(), db.customers.toArray()]);
                const cmap = new Map(customers.map((c) => [c.id, c.name]));
                const enriched: Row[] = sales
                    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                    .map((s) => ({
                        ...s,
                        customerLabel: s.customer_id ? cmap.get(s.customer_id) || '—' : 'Walk-in',
                    }));
                if (!cancelled) setRows(enriched);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return rows;
        return rows.filter(
            (r) =>
                r.invoice_number.toLowerCase().includes(s) ||
                r.customerLabel.toLowerCase().includes(s) ||
                r.payment_mode.toLowerCase().includes(s)
        );
    }, [rows, q]);

    const totals = useMemo(() => {
        const billed = rows.reduce((a, r) => a + r.final_amount, 0);
        const received = rows.filter((r) => r.status === 'COMPLETED' && r.payment_mode !== 'DUE').reduce((a, r) => a + r.final_amount, 0);
        const pending = rows.filter((r) => r.payment_mode === 'DUE' || r.status !== 'COMPLETED').reduce((a, r) => a + r.final_amount, 0);
        return { billed, received, pending };
    }, [rows]);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6 animate-slideIn">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-black text-foreground-strong tracking-tight">Billing Sales List</h1>
                    <p className="text-sm text-muted mt-1">Invoices from your shop — search, print, and open POS for new bills.</p>
                </div>
                <Link to="/billing/new" className={primaryLinkClass}>
                    <Plus className="w-4 h-4" />
                    New invoice
                </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-4">
                    <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">Total billed</p>
                    <p className="text-xl font-black tabular-nums mt-1">{formatInr(totals.billed)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">Received (excl. due)</p>
                    <p className="text-xl font-black tabular-nums mt-1 text-success">{formatInr(totals.received)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">Outstanding / other</p>
                    <p className="text-xl font-black tabular-nums mt-1 text-warning">{formatInr(totals.pending)}</p>
                </Card>
            </div>

            <Card className="p-4 space-y-4">
                <div className="flex flex-col md:flex-row gap-3 md:items-center">
                    <Input
                        placeholder="Search invoice, customer, payment…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        icon="🔍"
                        containerClassName="flex-1"
                    />
                    <div className="flex gap-2 flex-wrap">
                        <Input type="date" containerClassName="w-40" className="py-2.5" />
                        <Input type="date" containerClassName="w-40" className="py-2.5" />
                    </div>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Invoice</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Customer</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Date</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider text-right">Amount</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Payment</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Status</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider text-right">Actions</TableCell>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted py-12">
                                    Loading sales…
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-16">
                                    <p className="text-muted font-medium mb-4">No invoices match this view yet.</p>
                                    <Link to="/billing/new" className={primaryLinkClass}>
                                        Start a sale in POS
                                    </Link>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((r) => (
                                <TableRow key={r.id}>
                                    <TableCell className="font-mono font-bold">{r.invoice_number}</TableCell>
                                    <TableCell>{r.customerLabel}</TableCell>
                                    <TableCell className="text-muted text-sm">
                                        {format(new Date(r.created_at), 'dd MMM yyyy, HH:mm')}
                                    </TableCell>
                                    <TableCell className="text-right font-black tabular-nums">{formatInr(r.final_amount)}</TableCell>
                                    <TableCell>
                                        <Badge variant="neutral">{r.payment_mode}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={saleStatusVariant(r.status)}>{r.status}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <button
                                                type="button"
                                                className="p-2 rounded-lg text-muted hover:bg-surface-elevated hover:text-primary"
                                                title="View"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                className="p-2 rounded-lg text-muted hover:bg-surface-elevated hover:text-primary"
                                                title="Print"
                                            >
                                                <Printer className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
};
