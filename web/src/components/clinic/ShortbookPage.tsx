import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import api from '../../lib/api';
import { Card } from '../ui/Card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table';

type ShortbookApiRow = {
    id: string;
    quantity_needed?: number | null;
    reason?: string | null;
    created_at?: string | null;
    medicines?: { name?: string | null; generic_name?: string | null } | null;
};

export const ShortbookPage = () => {
    const { data, isLoading, error } = useQuery({
        queryKey: ['shortbook'],
        queryFn: async () => {
            const { data: body } = await api.get<{ data: ShortbookApiRow[] }>('/shortbook');
            return Array.isArray(body?.data) ? body.data : [];
        },
    });

    const rows = data ?? [];

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-6 animate-slideIn">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-black text-foreground-strong tracking-tight flex items-center gap-2">
                        <ClipboardList className="w-7 h-7 text-success" aria-hidden />
                        Shortbook
                    </h1>
                    <p className="text-sm text-muted mt-1">
                        Reorder queue — items flagged for purchase. Open a new purchase when you are ready to order stock.
                    </p>
                </div>
                <Link
                    to="/purchases/new"
                    className="inline-flex items-center justify-center rounded-lg bg-primary text-on-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-widest border border-white/10 hover:brightness-110 transition-colors shrink-0"
                >
                    New purchase
                </Link>
            </div>

            {error && (
                <Card className="p-4 border border-warning/40 bg-warning/5 text-sm text-warning">
                    Could not load shortbook from the server. If your backend does not expose{' '}
                    <code className="text-xs bg-bg-card px-1 rounded">GET /api/shortbook</code>, contact your administrator.
                </Card>
            )}

            <Card className="p-0 overflow-hidden border border-border">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableCell className="pb-2 text-muted font-bold uppercase text-xs">Medicine</TableCell>
                                <TableCell className="pb-2 text-muted font-bold uppercase text-xs">Generic</TableCell>
                                <TableCell className="pb-2 text-muted font-bold uppercase text-xs text-right">Qty needed</TableCell>
                                <TableCell className="pb-2 text-muted font-bold uppercase text-xs">Reason</TableCell>
                                <TableCell className="pb-2 text-muted font-bold uppercase text-xs">Added</TableCell>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={5} className="py-3">
                                            <div className="h-4 bg-bg-card rounded animate-pulse" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-10 text-muted text-sm">
                                        No open shortbook items. Add from inventory when stock runs low.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((row) => (
                                    <TableRow key={row.id} className="border-b border-border/50 last:border-0">
                                        <TableCell className="py-3 font-semibold text-foreground">
                                            {row.medicines?.name ?? '—'}
                                        </TableCell>
                                        <TableCell className="py-3 text-muted text-sm">{row.medicines?.generic_name ?? '—'}</TableCell>
                                        <TableCell className="py-3 text-right tabular-nums font-mono">
                                            {row.quantity_needed ?? '—'}
                                        </TableCell>
                                        <TableCell className="py-3 text-sm capitalize text-muted">{row.reason ?? '—'}</TableCell>
                                        <TableCell className="py-3 text-sm text-muted font-mono">
                                            {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
};
