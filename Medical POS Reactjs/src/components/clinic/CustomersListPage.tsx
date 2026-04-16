import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { db } from '../../db/index';
import type { Customer } from '../../core/types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table';
import { formatInr } from '../../lib/formatInr';

export const CustomersListPage: React.FC = () => {
    const [rows, setRows] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const list = await db.customers.orderBy('name').toArray();
                if (!cancelled) setRows(list);
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
        return rows.filter((c) => c.name.toLowerCase().includes(s) || c.phone.includes(s));
    }, [rows, q]);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6 animate-slideIn">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-black text-foreground-strong tracking-tight">Customers</h1>
                    <p className="text-sm text-muted mt-1">Walk-in and registered buyers — credit balance is tracked at billing.</p>
                </div>
                <Button variant="secondary" type="button" className="whitespace-nowrap" onClick={() => {}}>
                    <Plus className="w-4 h-4 mr-2 inline" />
                    Add customer
                </Button>
            </div>

            <Card className="p-4 space-y-4">
                <Input placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} icon="🔍" />
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Name</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Phone</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Email</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider text-right">Credit limit</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider text-right">Due balance</TableCell>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted py-12">
                                    Loading customers…
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-16 text-muted">
                                    <p className="font-medium mb-2">No customers in local database.</p>
                                    <p className="text-sm">Add customers from POS or import master data.</p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((c) => (
                                <TableRow key={c.id}>
                                    <TableCell className="font-bold">{c.name}</TableCell>
                                    <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                                    <TableCell className="text-muted text-sm">{c.email || '—'}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatInr(c.credit_limit ?? 0)}</TableCell>
                                    <TableCell className="text-right font-black tabular-nums text-warning">
                                        {formatInr(c.credit_balance ?? 0)}
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
