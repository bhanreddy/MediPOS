import React, { useMemo, useId, useState } from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { useQuery } from '@tanstack/react-query';
import { useDirectory } from '../../hooks/useDirectory';
import { LoadError, NoSearchResults, Pagination } from '../ui/ListFeedback';
import type { Expense } from '../../core/types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table';
import { formatInr } from '../../lib/formatInr';

const EXPENSE_CATEGORIES = [
    { value: 'rent', label: 'Rent' },
    { value: 'salary', label: 'Salary' },
    { value: 'utilities', label: 'Utilities' },
    { value: 'supplies', label: 'Supplies' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'misc', label: 'Miscellaneous' },
] as const;

const PAYMENT_MODES = [
    { value: 'cash', label: 'Cash' },
    { value: 'upi', label: 'UPI' },
    { value: 'card', label: 'Card' },
    { value: 'bank_transfer', label: 'Bank transfer' },
] as const;

type ExpenseRow = Expense & { expense_date?: string };

function normalizeExpense(raw: Record<string, unknown>): ExpenseRow {
    const expenseDate = String(raw.expense_date ?? raw.date ?? '');
    return {
        id: String(raw.id ?? raw._local_id ?? ''),
        category: String(raw.category ?? 'misc'),
        description: String(raw.description ?? ''),
        amount: Number(raw.amount ?? 0),
        payment_mode: String(raw.payment_mode ?? 'cash').toUpperCase() as Expense['payment_mode'],
        date: expenseDate,
        user_id: String(raw.user_id ?? raw.recorded_by ?? ''),
        created_at: String(raw.created_at ?? ''),
        updated_at: String(raw.updated_at ?? ''),
        last_modified: Number(raw.last_modified ?? Date.now()),
        expense_date: expenseDate,
    };
}

export const ExpensesListPage: React.FC = () => {
    const formId = useId();
    const [q, setQ] = useState('');
    const [cat, setCat] = useState<string>('ALL');
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    const [category, setCategory] = useState<string>('misc');
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [expenseDate, setExpenseDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const [paymentMode, setPaymentMode] = useState<string>('cash');

    const { rows: rawRows, loading, error, refresh, page, limit, total, setPage, fetching } = useDirectory<Record<string, unknown>>('/expenses', q, cat === 'ALL' ? {} : { category: cat });
    const filtered = useMemo(() => rawRows.map(normalizeExpense), [rawRows]);
    const { data: summary, refetch: refetchSummary } = useQuery({
        queryKey: ['expense-summary'],
        queryFn: async () => (await api.get('/expenses/summary')).data.data as { grand_total: number; summary: { category: string }[] },
    });
    const categories = ['ALL', ...new Set([...EXPENSE_CATEGORIES.map(item => item.value), ...(summary?.summary.map(item => item.category) || [])])];
    const monthTotal = summary?.grand_total;

    const resetForm = () => {
        setCategory('misc');
        setDescription('');
        setAmount('');
        setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
        setPaymentMode('cash');
    };

    const openModal = () => {
        resetForm();
        setModalOpen(true);
    };

    const closeModal = () => {
        if (saving) return;
        setModalOpen(false);
        resetForm();
    };

    const handleSave = async () => {
        const parsedAmount = Number(amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            toast.error('Enter a valid amount');
            return;
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate.trim())) {
            toast.error('Date must be YYYY-MM-DD');
            return;
        }

        setSaving(true);
        try {
            await api.post('/expenses', {
                category,
                description: description.trim() || null,
                amount: parsedAmount,
                expense_date: expenseDate.trim(),
                payment_mode: paymentMode,
            });
            await Promise.all([refresh(), refetchSummary()]);
            toast.success('Expense recorded');
            setModalOpen(false);
            resetForm();
        } catch (e: unknown) {
            const msg =
                (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
                (e instanceof Error ? e.message : 'Failed to record expense');
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const formatCategoryLabel = (value: string) =>
        EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;

    const formatPaymentLabel = (value: string) => {
        const normalized = value.toLowerCase();
        return PAYMENT_MODES.find((p) => p.value === normalized)?.label ?? value;
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6 animate-slideIn">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-black text-foreground-strong tracking-tight">Expenses</h1>
                    <p className="text-sm text-muted mt-1">Clinic operating costs — cash, UPI, and card outflows.</p>
                </div>
                <Button variant="secondary" type="button" className="whitespace-nowrap" onClick={openModal}>
                    <Plus className="w-4 h-4 mr-2 inline" />
                    Record expense
                </Button>
            </div>

            <Card className="p-4">
                <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">Total logged (all periods)</p>
                <p className="text-2xl font-black tabular-nums mt-1">{monthTotal === undefined ? '—' : formatInr(monthTotal)}</p>
            </Card>

            <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                    <button
                        key={c}
                        type="button"
                        onClick={() => { setCat(c); setPage(1); }}
                        aria-pressed={cat === c}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border-2 transition-colors ${
                            cat === c ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted hover:border-border'
                        }`}
                    >
                        {c === 'ALL' ? c : formatCategoryLabel(c)}
                    </button>
                ))}
            </div>

            <Card className="p-4 space-y-4">
                <Input placeholder="Search description…" value={q} aria-label="Search expenses" onChange={(e) => { setQ(e.target.value); setPage(1); }} icon="🔍" />
                {error && <LoadError onRetry={() => void refresh()} />}
                <Table aria-busy={loading || fetching}>
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
                        {error ? null : loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted py-12">
                                    Loading expenses…
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-16 text-muted">
                                    {q.trim() || cat !== 'ALL' ? <NoSearchResults onClear={() => { setQ(''); setCat('ALL'); setPage(1); }} /> : <>
                                    <p className="font-medium mb-2">No expenses recorded.</p>
                                    <p className="text-sm">Tap Record expense to log clinic costs.</p></>}
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((r) => (
                                <TableRow key={r.id}>
                                    <TableCell className="text-sm text-muted">
                                        {r.date ? format(new Date(r.date), 'dd MMM yyyy') : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="neutral">{formatCategoryLabel(r.category)}</Badge>
                                    </TableCell>
                                    <TableCell>{r.description || '—'}</TableCell>
                                    <TableCell className="text-right font-black tabular-nums">{formatInr(r.amount)}</TableCell>
                                    <TableCell>
                                        <Badge variant="primary">{formatPaymentLabel(String(r.payment_mode))}</Badge>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                {!error && <Pagination page={page} limit={limit} total={total} onPage={setPage} busy={loading || fetching} />}
            </Card>

            <Modal
                isOpen={modalOpen}
                onClose={closeModal}
                title="Record expense"
                footer={
                    <>
                        <Button variant="ghost" type="button" onClick={closeModal} disabled={saving}>
                            Cancel
                        </Button>
                        <Button variant="primary" type="submit" form={formId} disabled={saving}>
                            {saving ? 'Saving…' : 'Save expense'}
                        </Button>
                    </>
                }
            >
                <form id={formId} onSubmit={event => { event.preventDefault(); void handleSave(); }} className="space-y-4">
                    <Select
                        label="Category *"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        options={[...EXPENSE_CATEGORIES]}
                    />
                    <Input
                        label="Description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Electricity bill, staff lunch"
                    />
                    <Input
                        label="Amount *"
                        type="number"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                    />
                    <Input
                        label="Date *"
                        type="date"
                        value={expenseDate}
                        onChange={(e) => setExpenseDate(e.target.value)}
                        placeholder="YYYY-MM-DD"
                    />
                    <Select
                        label="Paid via *"
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value)}
                        options={[...PAYMENT_MODES]}
                    />
                </form>
            </Modal>
        </div>
    );
};
