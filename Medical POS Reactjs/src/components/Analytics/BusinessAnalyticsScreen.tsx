import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
} from 'recharts';

const COLORS = ['#22c55e', '#3b82f6', '#eab308', '#ef4444'];

async function fetchAnalytics(period: string) {
    const [trend, perf, cust, inv, pay, purch] = await Promise.all([
        api.get('/analytics/revenue-trend', { params: { period, range: 30 } }),
        api.get('/analytics/medicine-performance', { params: { limit: 10 } }),
        api.get('/analytics/customer-insights'),
        api.get('/analytics/inventory-health'),
        api.get('/analytics/payment-behaviour'),
        api.get('/analytics/purchase-intelligence'),
    ]);
    return {
        trend: trend.data.data,
        perf: perf.data.data,
        cust: cust.data.data,
        inv: inv.data.data,
        pay: pay.data.data,
        purch: purch.data.data,
    };
}

export const BusinessAnalyticsScreen: React.FC = () => {
    const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ['business-analytics', period],
        queryFn: () => fetchAnalytics(period),
    });

    if (isLoading) {
        return (
            <div className="p-8 text-muted font-medium animate-pulse">Loading analytics…</div>
        );
    }

    if (isError || !data) {
        return (
            <div className="p-8 space-y-4">
                <p className="text-danger font-semibold">Could not load analytics.</p>
                <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold"
                    onClick={() => void refetch()}
                >
                    Retry
                </button>
            </div>
        );
    }

    const seg = data.cust.customer_segments;
    const pieData = [
        { name: 'High value', value: seg.high_value },
        { name: 'Regular', value: seg.regular },
        { name: 'At risk', value: seg.at_risk },
        { name: 'Lost', value: seg.lost },
    ];

    return (
        <div className="space-y-8 animate-slideIn">
            <div>
                <h1 className="text-2xl font-black text-foreground-strong tracking-tight">Business Analytics</h1>
                <p className="text-sm text-muted mt-1">Revenue, inventory, customers, and payments</p>
            </div>

            <div className="flex gap-2 flex-wrap">
                {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                    <button
                        key={p}
                        type="button"
                        onClick={() => setPeriod(p)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border-2 ${
                            period === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted'
                        }`}
                    >
                        {p}
                    </button>
                ))}
            </div>

            <div className="bg-surface-elevated border-2 border-border rounded-xl p-4 h-72">
                <h3 className="text-label font-black text-muted uppercase mb-2">Revenue trend</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <LineChart data={data.trend}>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="revenue" stroke="rgb(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-surface-elevated border-2 border-border rounded-xl p-4 h-80">
                    <h3 className="text-label font-black text-muted uppercase mb-2">Top medicines by revenue</h3>
                    <ResponsiveContainer width="100%" height="90%">
                        <BarChart data={data.perf} layout="vertical">
                            <XAxis type="number" tick={{ fontSize: 10 }} />
                            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Bar dataKey="revenue" fill="rgb(var(--primary))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-surface-elevated border-2 border-border rounded-xl p-4 h-80">
                    <h3 className="text-label font-black text-muted uppercase mb-2">Customer segments</h3>
                    <ResponsiveContainer width="100%" height="90%">
                        <PieChart>
                            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                {pieData.map((_, i) => (
                                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-surface border-2 border-border rounded-xl p-4">
                    <div className="text-label text-muted font-bold uppercase text-xs">Inventory value</div>
                    <div className="text-xl font-black tabular-nums mt-1">₹{Number(data.inv.total_inventory_value).toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-surface border-2 border-border rounded-xl p-4">
                    <div className="text-label text-muted font-bold uppercase text-xs">Expiry risk value</div>
                    <div className="text-xl font-black tabular-nums mt-1">₹{Number(data.inv.expiry_risk_value).toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-surface border-2 border-border rounded-xl p-4">
                    <div className="text-label text-muted font-bold uppercase text-xs">Turnover ratio</div>
                    <div className="text-xl font-black tabular-nums mt-1">{data.inv.turnover_ratio}</div>
                </div>
                <div className="bg-surface border-2 border-border rounded-xl p-4">
                    <div className="text-label text-muted font-bold uppercase text-xs">Days of supply</div>
                    <div className="text-xl font-black tabular-nums mt-1">{data.inv.days_of_supply}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-surface-elevated border-2 border-border rounded-xl p-4">
                    <h3 className="text-label font-black text-muted uppercase mb-2">Payment modes (90d)</h3>
                    <ul className="space-y-2 text-sm">
                        {Object.entries(data.pay.payment_mode_split).map(([k, v]) => (
                            <li key={k} className="flex justify-between">
                                <span className="font-bold capitalize">{k}</span>
                                <span className="tabular-nums">{v as number}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="bg-surface-elevated border-2 border-border rounded-xl p-4">
                    <h3 className="text-label font-black text-muted uppercase mb-2">Outstanding aging</h3>
                    <ul className="space-y-2 text-sm tabular-nums">
                        <li className="flex justify-between">
                            <span>0–7d</span>
                            <span>₹{data.pay.outstanding_aging.d0_7}</span>
                        </li>
                        <li className="flex justify-between">
                            <span>8–30d</span>
                            <span>₹{data.pay.outstanding_aging.d8_30}</span>
                        </li>
                        <li className="flex justify-between">
                            <span>31–60d</span>
                            <span>₹{data.pay.outstanding_aging.d31_60}</span>
                        </li>
                        <li className="flex justify-between">
                            <span>60d+</span>
                            <span>₹{data.pay.outstanding_aging.d60p}</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
