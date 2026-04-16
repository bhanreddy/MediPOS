import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { db } from '../../db/index';
import type { Expense } from '../../core/types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table';
import { formatInr } from '../../lib/formatInr';

export const ExpensesListPage: React.FC = () => {
    const [rows, setRows] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [cat, setCat] = useState<string>('ALL');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const list = await db.expenses.orderBy('date').reverse().toArray();
                if (!cancelled) setRows(list);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const categories = useMemo(() => {
        const s = new Set(rows.map((r) => r.category));
        return ['ALL', ...Array.from(s).sort()];
    }, [rows]);

    const filtered = useMemo(() => {
        let list = rows;
        if (cat !== 'ALL') list = list.filter((r) => r.category === cat);
        const s = q.trim().toLowerCase();
        if (s) list = list.filter((r) => r.description.toLowerCase().includes(s) || r.category.toLowerCase().includes(s));
        return list;
    }, [rows, q, cat]);

    const monthTotal = useMemo(() => rows.reduce((a, r) => a + r.amount, 0), [rows]);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6 animate-slideIn">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-black text-foreground-strong tracking-tight">Expenses</h1>
                    <p className="text-sm text-muted mt-1">Clinic operating costs — cash, UPI, and card outflows.</p>
                </div>
                <Button variant="secondary" type="button" className="whitespace-nowrap" onClick={() => {}}>
                    <Plus className="w-4 h-4 mr-2 inline" />
                    Record expense
                </Button>
            </div>

            <Card className="p-4">
                <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">Total logged (all periods)</p>
                <p className="text-2xl font-black tabular-nums mt-1">{formatInr(monthTotal)}</p>
            </Card>

            <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                    <button
                        key={c}
                        type="button"
                        onClick={() => setCat(c)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border-2 transition-colors ${
                            cat === c ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted hover:border-border'
                        }`}
                    >
                        {c}
                    </button>
                ))}
            </div>

            <Card className="p-4 space-y-4">
                <Input placeholder="Search description…" value={q} onChange={(e) => setQ(e.target.value)} icon="🔍" />
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Date</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Category</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Description</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider text-right">Amount</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Paid via</TableCell>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted py-12">
                                    Loading expenses…
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-16 text-muted">
                                    <p className="font-medium mb-2">No expenses recorded.</p>
                                    <p className="text-sm">Use Record expense when you wire the form.</p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((r) => (
                                <TableRow key={r.id}>
                                    <TableCell className="text-sm text-muted">{format(new Date(r.date), 'dd MMM yyyy')}</TableCell>
                                    <TableCell>
                                        <Badge variant="neutral">{r.category}</Badge>
                                    </TableCell>
                                    <TableCell>{r.description}</TableCell>
                                    <TableCell className="text-right font-black tabular-nums">{formatInr(r.amount)}</TableCell>
                                    <TableCell>
                                        <Badge variant="primary">{r.payment_mode}</Badge>
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
