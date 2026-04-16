import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { db } from '../../db/index';
import type { Purchase } from '../../core/types';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table';
import { formatInr } from '../../lib/formatInr';

type Row = Purchase & { supplierName: string };

const primaryLinkClass =
    'inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-on-primary px-5 py-2.5 font-extrabold uppercase tracking-widest text-xs shadow-md shadow-primary/20 border border-white/10 hover:brightness-110 transition-all';

export const PurchasesListPage: React.FC = () => {
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [purchases, suppliers] = await Promise.all([db.purchases.toArray(), db.suppliers.toArray()]);
                const smap = new Map(suppliers.map((s) => [s.id, s.name]));
                const enriched: Row[] = purchases
                    .sort((a, b) => (a.invoice_date < b.invoice_date ? 1 : -1))
                    .map((p) => ({
                        ...p,
                        supplierName: smap.get(p.supplier_id) || 'Unknown supplier',
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
                r.supplierName.toLowerCase().includes(s) ||
                r.status.toLowerCase().includes(s)
        );
    }, [rows, q]);

    const monthSpent = useMemo(() => rows.filter((r) => r.status === 'COMPLETED').reduce((a, r) => a + r.total_amount, 0), [rows]);
    const pendingCount = rows.filter((r) => r.status === 'PENDING').length;

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
                    <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">Recorded purchases</p>
                    <p className="text-xl font-black tabular-nums mt-1">{rows.length}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">Completed value (all time)</p>
                    <p className="text-xl font-black tabular-nums mt-1">{formatInr(monthSpent)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">Pending inward</p>
                    <p className="text-xl font-black tabular-nums mt-1">{pendingCount}</p>
                </Card>
            </div>

            <Card className="p-4 space-y-4">
                <Input placeholder="Search PO / supplier / status…" value={q} onChange={(e) => setQ(e.target.value)} icon="🔍" />
                <Table>
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
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted py-12">
                                    Loading purchases…
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-16">
                                    <p className="text-muted font-medium mb-4">No purchase records yet.</p>
                                    <Link to="/purchases/new" className={primaryLinkClass}>
                                        Record inward stock
                                    </Link>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((r) => (
                                <TableRow key={r.id}>
                                    <TableCell className="font-mono font-bold">{r.invoice_number}</TableCell>
                                    <TableCell>{r.supplierName}</TableCell>
                                    <TableCell className="text-muted text-sm">{format(new Date(r.invoice_date), 'dd MMM yyyy')}</TableCell>
                                    <TableCell className="text-muted text-sm">{format(new Date(r.received_date), 'dd MMM yyyy')}</TableCell>
                                    <TableCell className="text-right font-black tabular-nums">{formatInr(r.total_amount)}</TableCell>
                                    <TableCell>
                                        <Badge variant={r.status === 'COMPLETED' ? 'success' : 'warning'}>{r.status}</Badge>
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
