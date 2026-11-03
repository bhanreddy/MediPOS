import React from 'react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Table } from '../ui/Table';
import { useExpenses } from '../../hooks/useExpenses';
import { EXPENSE_SCREEN_COPY } from '../../config/appContent';
// For now, adhere to "Empty State" -> if no data, Table handles it.

/**
 * PHASE 12: EXPENSE SPEED OPTIMIZATION
 * Prioritizes: Rapid entry (<10s), Keyboard only, Clean ledger
 */
export const ExpenseScreen: React.FC = () => {
    const { expenses, metrics, isLoading } = useExpenses();

    const formatCurrency = (val: number) =>
        val.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

    return (
        <div className="h-full flex flex-col gap-8 animate-slideIn select-none">
            {/* COCKPIT HEADER */}
            <div className="flex justify-between items-end">
                <div className="space-y-1">
                    <h2 className="text-billing-total font-black text-foreground-strong tracking-tighter uppercase italic leading-none">
                        {EXPENSE_SCREEN_COPY.title}
                    </h2>
                    <p className="text-muted text-sm font-black uppercase tracking-widest">{EXPENSE_SCREEN_COPY.subtitle}</p>
                </div>

                <Button variant="primary" className="h-[60px] px-12 font-black shadow-lg">
                    {EXPENSE_SCREEN_COPY.quickEntry}
                </Button>
            </div>

            {/* DENSE KPI FEEDBACK */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-surface-elevated border-2 border-primary/20 p-8 rounded-2xl flex items-center justify-between transition-all hover:bg-surface-alt">
                    <div>
                        <p className="text-label font-black uppercase tracking-widest text-primary/60 mb-2">{EXPENSE_SCREEN_COPY.dailyOutflow}</p>
                        <p className="text-4xl font-black text-foreground-strong italic tracking-tighter tabular-nums text-primary">
                            {isLoading ? '...' : formatCurrency(metrics.dailyTotal)}
                        </p>
                    </div>
                    <div className="text-6xl opacity-10">💸</div>
                </div>
                <div className="bg-surface-elevated border-2 border-border p-8 rounded-2xl flex items-center justify-between transition-all hover:bg-surface-alt">
                    <div>
                        <p className="text-label font-black uppercase tracking-widest text-muted mb-2">Monthly Aggregate</p>
                        <p className="text-4xl font-black text-foreground-strong italic tracking-tighter tabular-nums">
                            {isLoading ? '...' : formatCurrency(metrics.monthlyTotal)}
                        </p>
                    </div>
                    <div className="text-6xl opacity-10">📊</div>
                </div>
            </div>

            {/* LEDGER TABLE: High Density */}
            <div className="flex-1 min-h-0 bg-surface border-2 border-border rounded-xl overflow-hidden flex flex-col shadow-2xl">
                <Table
                    headers={[...EXPENSE_SCREEN_COPY.tableHeaders]}
                    data={expenses}
                    isEmpty={expenses.length === 0}
                    emptyMessage={EXPENSE_SCREEN_COPY.emptyMessage}
                    renderRow={(exp, index) => (
                        <tr key={exp.id || index} className="border-b-2 border-border hover:bg-surface-elevated transition-colors group">
                            <td className="px-6 py-4 tabular-nums text-muted text-xs font-mono">{exp.date}</td>
                            <td className="px-6 py-4">
                                <Badge variant="neutral">{exp.category}</Badge>
                            </td>
                            <td className="px-6 py-4 font-black text-foreground-strong uppercase tracking-tight text-sm">{exp.description || '—'}</td>
                            <td className="px-6 py-4 text-right font-black text-foreground-strong tabular-nums text-lg">
                                {formatCurrency(exp.amount)}
                            </td>
                        </tr>
                    )}
                />
            </div>
        </div>
    );
};
