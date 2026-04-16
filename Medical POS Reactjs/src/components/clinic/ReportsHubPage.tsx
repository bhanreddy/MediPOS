import React, { useState } from 'react';
import { LineChart as LineChartIcon, ShoppingCart, Wallet, FileText, PieChart } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

const REPORTS = [
    {
        id: 'sales',
        title: 'Sales report',
        desc: 'Invoice-wise GST and payment summary for any period.',
        icon: LineChartIcon,
    },
    {
        id: 'purchase',
        title: 'Purchase report',
        desc: 'Inward value, ITC alignment, and supplier mix.',
        icon: ShoppingCart,
    },
    {
        id: 'expense',
        title: 'Expense report',
        desc: 'Category burn and voucher trail for audits.',
        icon: Wallet,
    },
    {
        id: 'gst',
        title: 'GST report',
        desc: 'GSTR-friendly totals with intra / inter split.',
        icon: FileText,
    },
    {
        id: 'pnl',
        title: 'Profit & loss',
        desc: 'Revenue, COGS, and margin at shop level.',
        icon: PieChart,
    },
] as const;

export const ReportsHubPage: React.FC = () => {
    const [selected, setSelected] = useState<string | null>('sales');

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-slideIn">
            <div>
                <h1 className="text-2xl font-black text-foreground-strong tracking-tight">Reports</h1>
                <p className="text-sm text-muted mt-1">Pick a report, set the period, then export when the engine is connected.</p>
            </div>

            <Card className="p-4 flex flex-col sm:flex-row gap-4 sm:items-end">
                <Input type="date" label="From" containerClassName="flex-1" className="py-2.5" />
                <Input type="date" label="To" containerClassName="flex-1" className="py-2.5" />
                <Button variant="primary" type="button" className="shrink-0">
                    Generate report
                </Button>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {REPORTS.map((r) => {
                    const Icon = r.icon;
                    const active = selected === r.id;
                    return (
                        <button
                            key={r.id}
                            type="button"
                            onClick={() => setSelected(r.id)}
                            className={`text-left rounded-xl border-2 p-5 transition-all hover:shadow-lg ${
                                active ? 'border-primary bg-primary/5 shadow-md' : 'border-border bg-bg-surface hover:border-primary/40'
                            }`}
                        >
                            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15 text-primary mb-3">
                                <Icon className="w-6 h-6" />
                            </div>
                            <h2 className="font-black text-foreground-strong tracking-tight">{r.title}</h2>
                            <p className="text-sm text-muted mt-2 leading-relaxed">{r.desc}</p>
                        </button>
                    );
                })}
            </div>

            <Card className="p-6 border-dashed border-2 border-border bg-surface-elevated/30">
                <p className="text-sm text-muted">
                    <span className="font-bold text-foreground">Preview:</span> Backend export routes can stream CSV / PDF for the
                    selected report. This hub is wired for navigation and layout; connect <code className="text-xs bg-bg-card px-1 rounded">/reports/*</code>{' '}
                    APIs when ready.
                </p>
            </Card>
        </div>
    );
};
