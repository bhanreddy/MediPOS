import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Card } from '../ui/Card';
import { useAuth } from '../../lib/auth';
import { format } from 'date-fns';
import { IndianRupee, ReceiptText, TrendingUp, Users } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table';

export const ClinicDashboard = () => {
    const { user } = useAuth();

    const { data: dashData, isLoading } = useQuery({
        queryKey: ['clinic-dashboard'],
        queryFn: async () => {
            const { data } = await api.get('/reports/dashboard');
            return data;
        }
    });

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
                        <div className="text-3xl font-black">₹{dashData?.today_revenue || '0.00'}</div>
                    )}
                </Card>
                <Card className="p-6">
                    <div className="flex items-center gap-2 text-muted uppercase text-xs font-bold tracking-wider mb-2">
                        <ReceiptText className="w-4 h-4 text-accent-secondary" /> Today's Bills
                    </div>
                    {isLoading ? <div className="h-8 bg-bg-card animate-pulse rounded" /> : (
                        <div className="text-3xl font-black">{dashData?.today_bills || 0}</div>
                    )}
                </Card>
                <Card className="p-6">
                    <div className="flex items-center gap-2 text-muted uppercase text-xs font-bold tracking-wider mb-2">
                        <TrendingUp className="w-4 h-4 text-success" /> Week Revenue
                    </div>
                    {isLoading ? <div className="h-8 bg-bg-card animate-pulse rounded" /> : (
                        <div className="text-3xl font-black">₹{dashData?.week_revenue || '0.00'}</div>
                    )}
                </Card>
                <Card className="p-6">
                    <div className="flex items-center gap-2 text-muted uppercase text-xs font-bold tracking-wider mb-2">
                        <Users className="w-4 h-4 text-danger" /> Outstanding
                    </div>
                    {isLoading ? <div className="h-8 bg-bg-card animate-pulse rounded" /> : (
                        <div className="text-3xl font-black">₹{dashData?.outstanding || '0.00'}</div>
                    )}
                </Card>
            </div>

            {/* Alert Strip */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 flex justify-between items-center group cursor-pointer hover:bg-danger/20 transition-colors">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-danger" />
                        <span className="font-semibold text-danger">Low Stock: {dashData?.alerts?.low_stock || 0} medicines</span>
                    </div>
                    <span className="text-danger opacity-0 group-hover:opacity-100 transition-opacity text-sm font-bold">View All &rarr;</span>
                </div>
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex justify-between items-center group cursor-pointer hover:bg-warning/20 transition-colors">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-warning" />
                        <span className="font-semibold text-warning">Expiring: {dashData?.alerts?.expiring || 0} batches</span>
                    </div>
                    <span className="text-warning opacity-0 group-hover:opacity-100 transition-opacity text-sm font-bold">View All &rarr;</span>
                </div>
                <div className="bg-success/10 border border-success/30 rounded-lg p-4 flex justify-between items-center group cursor-pointer hover:bg-success/20 transition-colors">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-success" />
                        <span className="font-semibold text-success">Shortbook: {dashData?.alerts?.shortbook || 0} items</span>
                    </div>
                    <span className="text-success opacity-0 group-hover:opacity-100 transition-opacity text-sm font-bold">View All &rarr;</span>
                </div>
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
                                ) : (dashData?.recent_sales || []).map((sale: any) => (
                                    <TableRow key={sale.id} className="border-b border-border/50 last:border-0 hover:bg-bg-primary">
                                        <TableCell className="py-3 font-mono text-sm">{sale.invoice_number}</TableCell>
                                        <TableCell className="py-3">{sale.customers?.name || 'Walk-in'}</TableCell>
                                        <TableCell className="py-3 text-right font-medium text-accent-primary">₹{sale.net_amount}</TableCell>
                                    </TableRow>
                                ))}
                                {!isLoading && (dashData?.recent_sales || []).length === 0 && (
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
                                <BarChart data={dashData?.weekly_chart || []}>
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
