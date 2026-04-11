import React, { useMemo, useState } from 'react';
import { ReportService } from '../../services/reportService';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Table } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { ANALYTICS_SCREEN_COPY } from '../../config/appContent';

const toISODate = (d: Date) => d.toISOString().split('T')[0];

export const SalesAnalyticsScreen: React.FC = () => {
    const todayStr = useMemo(() => toISODate(new Date()), []);
    const weekStart = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        return toISODate(d);
    }, []);
    const monthStart = useMemo(() => {
        const d = new Date();
        return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
    }, []);

    const [start, setStart] = useState(monthStart);
    const [end, setEnd] = useState(todayStr);
    const [loading, setLoading] = useState(false);
    const [series, setSeries] = useState<{ date: string; amount: number }[]>([]);
    const [top, setTop] = useState<{ productId: string; name: string; quantity: number; revenue: number }[]>([]);
    const [margins, setMargins] = useState<{ productId: string; name: string; profit: number; marginPercent: number }[]>([]);

    const startISO = `${start}T00:00:00.000Z`;
    const endISO = `${end}T23:59:59.999Z`;

    const run = async () => {
        setLoading(true);
        try {
            const [s, t, m] = await Promise.all([
                ReportService.getDailyRevenueSeries(startISO, endISO),
                ReportService.getTopSellingProducts(startISO, endISO, 10),
                ReportService.getProductMargins(startISO, endISO),
            ]);
            setSeries(s);
            setTop(t);
            setMargins(m.slice(0, 15));
        } finally {
            setLoading(false);
        }
    };

    const maxDay = useMemo(() => Math.max(1, ...series.map(x => x.amount)), [series]);

    return (
        <div className="h-full flex flex-col gap-8 animate-slideIn select-none overflow-auto">
            <div className="flex justify-between items-end flex-wrap gap-4">
                <div>
                    <h2 className="text-billing-total font-black text-foreground-strong tracking-tighter uppercase italic leading-none">
                        {ANALYTICS_SCREEN_COPY.title}
                    </h2>
                    <p className="text-muted text-sm font-black uppercase tracking-widest mt-1">{ANALYTICS_SCREEN_COPY.subtitle}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button variant="secondary" onClick={() => { setStart(todayStr); setEnd(todayStr); }}>
                        {ANALYTICS_SCREEN_COPY.today}
                    </Button>
                    <Button variant="secondary" onClick={() => { setStart(weekStart); setEnd(todayStr); }}>
                        {ANALYTICS_SCREEN_COPY.sevenDays}
                    </Button>
                    <Button variant="secondary" onClick={() => { setStart(monthStart); setEnd(todayStr); }}>
                        {ANALYTICS_SCREEN_COPY.month}
                    </Button>
                    <Button variant="primary" onClick={() => void run()} isLoading={loading}>
                        {ANALYTICS_SCREEN_COPY.run}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label={ANALYTICS_SCREEN_COPY.startLabel} type="date" value={start} onChange={e => setStart(e.target.value)} />
                <Input label={ANALYTICS_SCREEN_COPY.endLabel} type="date" value={end} onChange={e => setEnd(e.target.value)} />
            </div>

            <div className="bg-surface border-2 border-border rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-heading font-black uppercase">{ANALYTICS_SCREEN_COPY.dailyRevenue}</span>
                    <Badge variant="neutral">{ANALYTICS_SCREEN_COPY.barScaleHint}</Badge>
                </div>
                <div className="flex items-end gap-1 h-40 overflow-x-auto pb-2">
                    {series.length === 0 ? (
                        <span className="text-muted text-sm font-bold">{ANALYTICS_SCREEN_COPY.chartEmpty}</span>
                    ) : (
                        series.map(d => (
                            <div key={d.date} className="flex flex-col items-center gap-1 min-w-[28px]">
                                <div
                                    className="w-full bg-primary/80 rounded-t min-h-[4px] transition-all"
                                    style={{ height: `${(d.amount / maxDay) * 100}%` }}
                                    title={`₹${d.amount.toFixed(2)}`}
                                />
                                <span className="text-[8px] font-black text-muted -rotate-45 origin-top mt-4 whitespace-nowrap">
                                    {d.date.slice(5)}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                <div className="bg-surface border-2 border-border rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-border text-heading font-black uppercase">{ANALYTICS_SCREEN_COPY.topFastMovers}</div>
                    <Table
                        headers={[...ANALYTICS_SCREEN_COPY.tableHeadFast]}
                        data={top}
                        isEmpty={top.length === 0}
                        emptyMessage={ANALYTICS_SCREEN_COPY.emptyData}
                        renderRow={r => (
                            <tr key={r.productId} className="border-b-2 border-border">
                                <td className="px-4 py-2 font-bold text-sm uppercase">{r.name}</td>
                                <td className="px-4 py-2 tabular-nums font-black">{r.quantity}</td>
                                <td className="px-4 py-2 tabular-nums">₹{r.revenue.toFixed(2)}</td>
                            </tr>
                        )}
                    />
                </div>
                <div className="bg-surface border-2 border-border rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-border text-heading font-black uppercase">{ANALYTICS_SCREEN_COPY.profitByProduct}</div>
                    <Table
                        headers={[...ANALYTICS_SCREEN_COPY.tableHeadMargin]}
                        data={margins}
                        isEmpty={margins.length === 0}
                        emptyMessage={ANALYTICS_SCREEN_COPY.emptyData}
                        renderRow={r => (
                            <tr key={r.productId} className="border-b-2 border-border">
                                <td className="px-4 py-2 font-bold text-sm uppercase">{r.name}</td>
                                <td className="px-4 py-2 tabular-nums font-black">₹{r.profit.toFixed(2)}</td>
                                <td className="px-4 py-2 tabular-nums">{r.marginPercent.toFixed(2)}%</td>
                            </tr>
                        )}
                    />
                </div>
            </div>
        </div>
    );
};
