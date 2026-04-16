import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { db } from '../../db/index';
import type { Supplier } from '../../core/types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table';

export const SuppliersListPage: React.FC = () => {
    const [rows, setRows] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const list = await db.suppliers.orderBy('name').toArray();
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
        return rows.filter(
            (x) =>
                x.name.toLowerCase().includes(s) ||
                x.phone.toLowerCase().includes(s) ||
                (x.gstin || '').toLowerCase().includes(s)
        );
    }, [rows, q]);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6 animate-slideIn">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-black text-foreground-strong tracking-tight">Suppliers</h1>
                    <p className="text-sm text-muted mt-1">Distributors linked to purchase inward and GST.</p>
                </div>
                <Button variant="secondary" type="button" className="whitespace-nowrap" onClick={() => {}}>
                    <Plus className="w-4 h-4 mr-2 inline" />
                    Add supplier
                </Button>
            </div>

            <Card className="p-4 space-y-4">
                <Input placeholder="Search company, GSTIN, phone…" value={q} onChange={(e) => setQ(e.target.value)} icon="🔍" />
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Company</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">GSTIN</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Phone</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Email</TableCell>
                            <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">Status</TableCell>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted py-12">
                                    Loading suppliers…
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-16 text-muted">
                                    <p className="font-medium mb-2">No suppliers yet.</p>
                                    <p className="text-sm">Add vendors before recording purchases.</p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((s) => (
                                <TableRow key={s.id}>
                                    <TableCell className="font-bold">{s.name}</TableCell>
                                    <TableCell className="font-mono text-xs">{s.gstin}</TableCell>
                                    <TableCell className="text-sm">{s.phone}</TableCell>
                                    <TableCell className="text-muted text-sm">{s.email || '—'}</TableCell>
                                    <TableCell>
                                        <Badge variant={s.is_active ? 'success' : 'neutral'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
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
