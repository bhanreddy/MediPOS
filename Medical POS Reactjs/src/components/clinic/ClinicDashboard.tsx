import { useNavigate } from 'react-router-dom';
import { useClinicDashboardData } from '../../hooks/useClinicDashboardData';
import { Card } from '../ui/Card';
import { useAuth } from '../../lib/auth';
import { format } from 'date-fns';
import { IndianRupee, ReceiptText, TrendingUp, Users } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table';

type DashboardRecentSale = {
    id: string;
    invoice_number?: string;
    net_amount?: string | number;
    customers?: { name?: string | null } | null;
};

export const ClinicDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const { data: dashData, isLoading } = useClinicDashboardData();

    const alerts = {
        low_stock: Number(dashData?.alerts && typeof dashData.alerts === 'object' && 'low_stock' in dashData.alerts
            ? (dashData.alerts as { low_stock?: number }).low_stock
            : dashData?.low_stock_count ?? 0),
        expiring: Number(
            dashData?.alerts && typeof dashData.alerts === 'object' && 'expiring' in dashData.alerts
                ? (dashData.alerts as { expiring?: number }).expiring
                : dashData?.expiry_count_30d ?? 0,
        ),
        shortbook: Number(
            dashData?.alerts && typeof dashData.alerts === 'object' && 'shortbook' in dashData.alerts
                ? (dashData.alerts as { shortbook?: number }).shortbook
                : dashData?.shortbook_count ?? 0,
        ),
    };

    return (
        <div className="space-y-8 p-8 max-w-7xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground">Good morning, {user?.full_name?.split(' ')[0]}</h1>
                <p className="text-muted">{format(new Date(), 'EEEE, MMMM do, yyyy')}</p>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-6">
                    <div className="flex items-center gap-2 text-muted uppercase text-xs font-bold tracking-wider mb-2">
                        <IndianRupee className="w-4 h-4 text-accent-primary" /> Today's Revenue
                    </div>
                    {isLoading ? <div className="h-8 bg-bg-card animate-pulse rounded" /> : (
                        <div className="text-3xl font-black">₹{(dashData?.today_revenue as string | number | undefined) || '0.00'}</div>
                    )}
                </Card>
                <Card className="p-6">
                    <div className="flex items-center gap-2 text-muted uppercase text-xs font-bold tracking-wider mb-2">
                        <ReceiptText className="w-4 h-4 text-accent-secondary" /> Today's Bills
                    </div>
                    {isLoading ? <div className="h-8 bg-bg-card animate-pulse rounded" /> : (
                        <div className="text-3xl font-black">{Number(dashData?.today_bills ?? 0)}</div>
                    )}
                </Card>
                <Card className="p-6">
                    <div className="flex items-center gap-2 text-muted uppercase text-xs font-bold tracking-wider mb-2">
                        <TrendingUp className="w-4 h-4 text-success" /> Week Revenue
                    </div>
                    {isLoading ? <div className="h-8 bg-bg-card animate-pulse rounded" /> : (
                        <div className="text-3xl font-black">₹{(dashData?.week_revenue as string | number | undefined) || '0.00'}</div>
                    )}
                </Card>
                <Card className="p-6">
                    <div className="flex items-center gap-2 text-muted uppercase text-xs font-bold tracking-wider mb-2">
                        <Users className="w-4 h-4 text-danger" /> Outstanding
                    </div>
                    {isLoading ? <div className="h-8 bg-bg-card animate-pulse rounded" /> : (
                        <div className="text-3xl font-black">
                            ₹
                            {(
                                Number(dashData?.outstanding_receivable ?? 0) + Number(dashData?.outstanding_payable ?? 0)
                            ).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    )}
                </Card>
            </div>

            {/* Alert Strip — navigate to filtered inventory or shortbook */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                    type="button"
                    onClick={() => navigate('/inventory?focus=low_stock')}
                    className="text-left w-full bg-danger/10 border border-danger/30 rounded-lg p-4 flex justify-between items-center group cursor-pointer hover:bg-danger/20 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-danger shrink-0" />
                        <span className="font-semibold text-danger">Low Stock: {alerts.low_stock} medicines</span>
                    </div>
                    <span className="text-danger opacity-0 group-hover:opacity-100 transition-opacity text-sm font-bold shrink-0">
                        View All &rarr;
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => navigate('/inventory?focus=expiring')}
                    className="text-left w-full bg-warning/10 border border-warning/30 rounded-lg p-4 flex justify-between items-center group cursor-pointer hover:bg-warning/20 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-warning shrink-0" />
                        <span className="font-semibold text-warning">Expiring: {alerts.expiring} batches</span>
                    </div>
                    <span className="text-warning opacity-0 group-hover:opacity-100 transition-opacity text-sm font-bold shrink-0">
                        View All &rarr;
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => navigate('/shortbook')}
                    className="text-left w-full bg-success/10 border border-success/30 rounded-lg p-4 flex justify-between items-center group cursor-pointer hover:bg-success/20 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-success shrink-0" />
                        <span className="font-semibold text-success">Shortbook: {alerts.shortbook} items</span>
                    </div>
                    <span className="text-success opacity-0 group-hover:opacity-100 transition-opacity text-sm font-bold shrink-0">
                        View All &rarr;
                    </span>
                </button>
            </div>

            {/* Charts & Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-6">
                    <h3 className="text-lg font-bold mb-6">Recent Sales</h3>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableCell className="pb-2 text-muted">Invoice</TableCell>
                                    <TableCell className="pb-2 text-muted">Customer</TableCell>
                                    <TableCell className="pb-2 text-muted text-right">Amount</TableCell>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}><TableCell colSpan={3} className="py-2"><div className="h-4 bg-bg-card rounded animate-pulse" /></TableCell></TableRow>
                                    ))
                                ) : ((dashData?.recent_sales as DashboardRecentSale[] | undefined) ?? []).map((sale) => (
                                    <TableRow key={sale.id} className="border-b border-border/50 last:border-0 hover:bg-bg-primary">
                                        <TableCell className="py-3 font-mono text-sm">{sale.invoice_number}</TableCell>
                                        <TableCell className="py-3">{sale.customers?.name || 'Walk-in'}</TableCell>
                                        <TableCell className="py-3 text-right font-medium text-accent-primary">₹{sale.net_amount}</TableCell>
                                    </TableRow>
                                ))}
                                {!isLoading && ((dashData?.recent_sales as any[]) || []).length === 0 && (
                                    <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted">No recent sales</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </Card>

                <Card className="p-6">
                    <h3 className="text-lg font-bold mb-6">Weekly Revenue</h3>
                    <div className="h-64">
                        {isLoading ? <div className="w-full h-full bg-bg-card animate-pulse rounded" /> : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={(() => {
                                        const wc = dashData?.weekly_chart;
                                        if (Array.isArray(wc) && wc.length) return wc as { day?: string; revenue?: number }[];
                                        const dc = dashData?.daily_chart;
                                        if (Array.isArray(dc) && dc.length) {
                                            return (dc as { date?: string; revenue?: number }[]).map((d) => ({
                                                day: d.date?.slice(5) ?? '',
                                                revenue: Number(d.revenue ?? 0),
                                            }));
                                        }
                                        return [];
                                    })()}
                                >
                                    <XAxis dataKey="day" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip cursor={{ fill: '#ffffff0a' }} contentStyle={{ backgroundColor: '#0F1117', borderColor: '#ffffff1a' }} />
                                    <Bar dataKey="revenue" fill="#00C9A7" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};
